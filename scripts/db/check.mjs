import assert from "node:assert/strict";
import { mkdtempSync, rmdirSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { migrate } from "../../db/migrate.ts";

/** The same isolated acceptance fixtures run in the CLI and the regular suite. */
export function verifySchema() {
  const directory = mkdtempSync(join(tmpdir(), "watchnext-check-"));
  const path = join(directory, "checks.sqlite");
  const db = new DatabaseSync(path);
  const passed = [];
  const run = (sql, ...values) => db.prepare(sql).run(...values);
  const all = (sql, ...values) => db.prepare(sql).all(...values).map((row) => ({ ...row }));
  const rejects = (sql, ...values) => assert.throws(() => run(sql, ...values), /constraint|cannot store|timestamp|history|ten genres/i);
  const check = (label, action) => {
    try { action(); } catch (cause) { throw new Error(`FAIL: ${label}`, { cause }); }
    passed.push(label);
  };
  const title = (id, group, type, duration, style, provider = null, providerId = null, key = id) =>
    run(`INSERT INTO titles(id, group_id, title, title_key, content_type, duration_seconds,
      numbering_style, provider_namespace, provider_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id, group, id, key, type, duration, style, provider, providerId);

  try {
    check("empty database migrates with foreign keys and all required tables", () => {
      assert.deepEqual(migrate(db), ["0001_initial.sql"]);
      assert.equal(all("PRAGMA foreign_keys")[0].foreign_keys, 1);
      const names = all("SELECT name FROM sqlite_schema WHERE type = 'table'").map((row) => row.name);
      for (const name of ["groups", "invitations", "members", "titles", "contributors", "moods",
        "title_moods", "title_genres", "progress", "ratings", "notes", "schema_migrations"]) assert.ok(names.includes(name), name);
    });
    run("INSERT INTO groups(id, name) VALUES ('a', 'Example group'), ('b', 'Other group')");
    run("INSERT INTO invitations(id, group_id, token_hash) VALUES ('invite', 'a', 'SYNTHETIC_HASH_NOT_A_TOKEN')");
    run(`INSERT INTO members(id, group_id, name, name_key, avatar_color) VALUES
      ('anna', 'a', 'Anna', 'anna', '#334455'), ('max', 'a', 'Max', 'max', '#445566'),
      ('other', 'b', 'Anna', 'anna', '#556677')`);

    check("four content types, optional metadata, exact durations, numbering and multiple moods read back", () => {
      title("movie", "a", "movie", 5400, "none");
      title("video", "a", "youtube", 1440, "none", "youtube", "synthetic-video");
      title("series", "a", "series", 1320, "season_episode");
      title("anime", "a", "anime", 1200, "continuous");
      run("INSERT INTO title_moods VALUES ('video', 'funny'), ('video', 'relaxing')");
      run("INSERT INTO title_genres VALUES ('movie', 'comedy', 'Comedy')");
      assert.deepEqual(all("SELECT id, duration_seconds, numbering_style FROM titles ORDER BY id"), [
        { id: "anime", duration_seconds: 1200, numbering_style: "continuous" },
        { id: "movie", duration_seconds: 5400, numbering_style: "none" },
        { id: "series", duration_seconds: 1320, numbering_style: "season_episode" },
        { id: "video", duration_seconds: 1440, numbering_style: "none" },
      ]);
      assert.equal(all("SELECT * FROM title_moods WHERE title_id = 'video'").length, 2);
      assert.equal(all("SELECT provider_id, source_url, watch_url, cover_url FROM titles WHERE id = 'movie'")
        .every((row) => Object.values(row).every((value) => value === null)), true);
    });
    check("two contributors share one title; duplicate contribution rejected", () => {
      run("INSERT INTO contributors(group_id,title_id,member_id) VALUES ('a','movie','anna'), ('a','movie','max')");
      rejects("INSERT INTO contributors(group_id,title_id,member_id) VALUES ('a','movie','anna')");
      assert.equal(all("SELECT * FROM titles WHERE id='movie'").length, 1);
      assert.equal(all("SELECT * FROM contributors WHERE title_id='movie'").length, 2);
    });
    check("provider IDs are group- and namespace-scoped; manual keys stay unique including archives", () => {
      title("same-other-group", "b", "youtube", 100, "none", "youtube", "synthetic-video");
      title("same-other-provider", "a", "movie", 100, "none", "kinopoisk-unofficial", "synthetic-video");
      assert.throws(() => title("collision", "a", "youtube", 100, "none", "youtube", "synthetic-video"), /UNIQUE/);
      run("UPDATE titles SET archived = 1 WHERE id = 'video'");
      assert.throws(() => title("archived-collision", "a", "youtube", 100, "none", "youtube", "synthetic-video"), /UNIQUE/);
      run("UPDATE titles SET archived = 0 WHERE id = 'video'");
      title("manual-second", "a", "movie", 80, "none");
      assert.throws(() => title("same-manual", "a", "movie", 80, "none", null, null, "movie"), /UNIQUE/);
      rejects("UPDATE titles SET provider_namespace='youtube' WHERE id='movie'");
    });
    check("independent title-level progress, completion, ratings and notes persist; duplicates rejected", () => {
      run(`INSERT INTO progress(group_id,title_id,member_id,numbering_style,position_state,next_season,next_episode,completed)
        VALUES ('a','series','anna','season_episode','in_progress',2,3,0),
        ('a','series','max','season_episode','in_progress',2,7,1)`);
      run("INSERT INTO ratings VALUES ('a','series','anna',7), ('a','series','max',9)");
      run("INSERT INTO notes VALUES ('a','series','anna','Example note A'), ('a','series','max','Example note B')");
      assert.deepEqual(all("SELECT member_id,next_episode,completed FROM progress WHERE title_id='series' ORDER BY member_id"),
        [{ member_id: "anna", next_episode: 3, completed: 0 }, { member_id: "max", next_episode: 7, completed: 1 }]);
      assert.deepEqual(all("SELECT member_id,score FROM ratings ORDER BY member_id"),
        [{ member_id: "anna", score: 7 }, { member_id: "max", score: 9 }]);
      assert.deepEqual(all("SELECT body FROM notes ORDER BY member_id"), [{ body: "Example note A" }, { body: "Example note B" }]);
      rejects("INSERT INTO progress(group_id,title_id,member_id,numbering_style) VALUES ('a','series','anna','season_episode')");
      rejects("INSERT INTO ratings VALUES ('a','series','anna',5)");
      rejects("INSERT INTO notes VALUES ('a','series','anna','Duplicate')");
    });
    check("every history/contributor table rejects cross-group and orphan references; valid same-group succeeds", () => {
      const cases = [
        ["contributors", "group_id,title_id,member_id", "?,?,?", []],
        ["progress", "group_id,title_id,member_id,numbering_style", "?,?,?,?", ["none"]],
        ["ratings", "group_id,title_id,member_id,score", "?,?,?,?", [5]],
        ["notes", "group_id,title_id,member_id,body", "?,?,?,?", ["Example"]],
      ];
      for (const [table, columns, placeholders, suffix] of cases) {
        const sql = `INSERT INTO ${table}(${columns}) VALUES (${placeholders})`;
        rejects(sql, "a", "video", "other", ...suffix);
        rejects(sql, "a", "missing-title", "max", ...suffix);
        rejects(sql, "a", "video", "missing-member", ...suffix);
        run(sql, "a", "video", "max", ...suffix);
      }
      assert.deepEqual(all("PRAGMA foreign_key_check"), []);
    });
    check("duration and integer-rating boundaries succeed; zero/negative/fractional/out-of-range values fail", () => {
      title("minimum", "a", "movie", 1, "none");
      title("maximum", "a", "movie", 86400, "none");
      for (const value of [0, -1, 86401, 1.5]) rejects("UPDATE titles SET duration_seconds=? WHERE id='movie'", value);
      for (const value of [1, 10]) run("UPDATE ratings SET score=? WHERE title_id='series' AND member_id='anna'", value);
      for (const value of [0, 11, -1, 7.5]) rejects("UPDATE ratings SET score=? WHERE title_id='series' AND member_id='anna'", value);
      rejects("UPDATE titles SET numbering_style='continuous' WHERE id='movie'");
    });
    check("unknown/unstarted/known episodic positions preserve meaning and reject invalid coordinates/styles", () => {
      run("INSERT INTO progress(group_id,title_id,member_id,numbering_style) VALUES ('a','anime','anna','continuous')");
      assert.deepEqual(all("SELECT position_state,next_episode FROM progress WHERE title_id='anime'"), [{ position_state: "unknown", next_episode: null }]);
      run("UPDATE progress SET position_state='not_started',next_episode=1 WHERE title_id='anime'");
      rejects("UPDATE progress SET next_episode=2 WHERE title_id='anime'");
      run("UPDATE progress SET position_state='in_progress',next_episode=9999 WHERE title_id='anime'");
      for (const episode of [0, -1, 10000, 1.5, null]) rejects("UPDATE progress SET next_episode=? WHERE title_id='anime'", episode);
      rejects("UPDATE progress SET next_season=1 WHERE title_id='anime'");
      rejects("UPDATE progress SET next_season=NULL WHERE title_id='series'");
      rejects("UPDATE progress SET next_season=0 WHERE title_id='series'");
      rejects("UPDATE progress SET next_episode=0 WHERE title_id='series'");
      run("UPDATE progress SET next_season=1,next_episode=1 WHERE title_id='series' AND member_id='anna'");
      rejects("UPDATE progress SET numbering_style='continuous',next_season=NULL WHERE title_id='series'");
      run("UPDATE progress SET next_season=9999,next_episode=9999 WHERE title_id='series' AND member_id='anna'");
    });
    check("timestamps validate new entries, preserve historical values after duration correction, and completion is independent", () => {
      run("INSERT INTO progress(group_id,title_id,member_id,numbering_style,timestamp_seconds) VALUES ('a','movie','anna','none',0)");
      run("UPDATE progress SET timestamp_seconds=5400 WHERE title_id='movie'");
      assert.equal(all("SELECT completed FROM progress WHERE title_id='movie'")[0].completed, 0);
      for (const timestamp of [-1, 5401, 0.5]) rejects("UPDATE progress SET timestamp_seconds=? WHERE title_id='movie'", timestamp);
      run("UPDATE titles SET duration_seconds=3600 WHERE id='movie'");
      assert.equal(all("SELECT timestamp_seconds FROM progress WHERE title_id='movie'")[0].timestamp_seconds, 5400);
      run("UPDATE progress SET completed=1 WHERE title_id='movie'");
      run("UPDATE progress SET completed=0 WHERE title_id='movie'");
      rejects("UPDATE progress SET timestamp_seconds=5400 WHERE title_id='movie'");
      rejects("INSERT INTO progress(group_id,title_id,member_id,numbering_style,timestamp_seconds) VALUES ('a','movie','max','none',3601)");
      run("UPDATE progress SET timestamp_seconds=NULL WHERE title_id='movie'");
      assert.equal(all("SELECT timestamp_seconds FROM progress WHERE title_id='movie'")[0].timestamp_seconds, null);
    });
    check("name keys, genre/mood references, note limits and history-sensitive edits enforce their storage contracts", () => {
      rejects("INSERT INTO members(id,group_id,name,name_key,avatar_color) VALUES ('duplicate','a','ANNA','anna','#112233')");
      rejects("INSERT INTO title_moods VALUES ('movie','custom')");
      rejects("INSERT INTO notes VALUES ('a','movie','anna',?)", "x".repeat(2001));
      run("INSERT INTO notes VALUES ('a','movie','anna',?)", "😀".repeat(2000));
      assert.equal(all("SELECT length(body) AS size FROM notes WHERE title_id='movie'")[0].size, 2000);
      for (let index = 1; index < 10; index++) run("INSERT INTO title_genres VALUES ('movie',?,?)", `genre-${index}`, `Genre ${index}`);
      rejects("INSERT INTO title_genres VALUES ('movie','eleventh','Eleventh')");
      rejects("UPDATE titles SET numbering_style='continuous' WHERE id='series'");
      rejects("UPDATE titles SET content_type='youtube' WHERE id='movie'");
    });
    check("archive/reactivate preserves identifiers, provider identity and all member history", () => {
      const snapshot = () => ["titles", "progress", "ratings", "notes"].map((table) =>
        all(`SELECT * FROM ${table} ${table === "titles" ? "WHERE id='video'" : "WHERE title_id='video'"}`));
      const before = snapshot();
      run("UPDATE titles SET archived=1 WHERE id='video'");
      assert.equal(all("SELECT archived FROM titles WHERE id='video'")[0].archived, 1);
      run("UPDATE titles SET archived=0 WHERE id='video'");
      assert.deepEqual(snapshot(), before);
    });
    check("repeat migration is a no-op retaining fixture data, ledger, and valid database integrity", () => {
      const countBefore = all("SELECT count(*) AS count FROM titles")[0].count;
      assert.deepEqual(migrate(db), []);
      assert.equal(all("SELECT count(*) AS count FROM titles")[0].count, countBefore);
      assert.equal(all("SELECT count(*) AS count FROM schema_migrations")[0].count, 1);
      assert.equal(all("PRAGMA integrity_check")[0].integrity_check, "ok");
    });
    return passed;
  } finally {
    db.close();
    // Only the named file and its newly-created empty directory are removed.
    unlinkSync(path);
    rmdirSync(directory);
  }
}
