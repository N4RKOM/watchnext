// @vitest-environment node
import { DatabaseSync } from "node:sqlite";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { migrate } from "../../db/migrate";
const source = fileURLToPath(new URL("../../db/migrations/", import.meta.url));
it("nullable metadata migration preserves populated manual/provider rows and both-member history; reapply is a no-op", () => {
  const root = mkdtempSync(join(tmpdir(), "watchnext-metadata-migration-")), db = new DatabaseSync(":memory:");
  try {
    for (const name of ["0001_initial.sql", "0002_group_sessions.sql"]) cpSync(join(source, name), join(root, name));
    migrate(db, root);
    db.exec(`INSERT INTO groups(id,name) VALUES ('g','Group');
      INSERT INTO members(id,group_id,name,name_key,avatar_color) VALUES ('a','g','Anna','anna','#1d4ed8'),('b','g','Max','max','#1d4ed8');
      INSERT INTO titles(id,group_id,title,title_key,content_type,duration_seconds,numbering_style) VALUES ('manual','g','Hand authored','hand authored','movie',300,'none');
      INSERT INTO titles(id,group_id,title,title_key,content_type,duration_seconds,numbering_style,provider_namespace,provider_id) VALUES ('import','g','Imported','imported','youtube',120,'none','youtube','YtFixture01');
      INSERT INTO contributors(group_id,title_id,member_id) VALUES ('g','import','a'),('g','import','b');
      INSERT INTO progress(group_id,title_id,member_id,numbering_style,timestamp_seconds) VALUES ('g','import','a','none',20),('g','import','b','none',40);
      INSERT INTO ratings(group_id,title_id,member_id,score) VALUES ('g','import','a',8),('g','import','b',4);
      INSERT INTO notes(group_id,title_id,member_id,body) VALUES ('g','import','a','Anna note'),('g','import','b','Max note');`);
    const history = () => JSON.stringify(["contributors", "progress", "ratings", "notes"].map(table => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()));
    const before = history(), titles = db.prepare("SELECT * FROM titles ORDER BY id").all();
    cpSync(join(source, "0003_metadata_lifecycle.sql"), join(root, "0003_metadata_lifecycle.sql"));
    expect(migrate(db, root)).toEqual(["0003_metadata_lifecycle.sql"]);
    expect(history()).toBe(before);
    for (const row of titles) expect(db.prepare("SELECT * FROM titles WHERE id=?").get(row.id as string)).toMatchObject({ ...row, metadata_unavailable: 0 });
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    expect(migrate(db, root)).toEqual([]); expect(history()).toBe(before);
    expect(() => db.exec("UPDATE titles SET title=NULL WHERE id='manual'")).toThrow();
    db.exec("UPDATE titles SET metadata_unavailable=1,title=NULL,title_key=NULL,duration_seconds=NULL,content_type=NULL WHERE id='import'");
    expect(history()).toBe(before);
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  } finally { db.close(); if (dirname(resolve(root)) !== resolve(tmpdir()) || !basename(root).startsWith("watchnext-metadata-migration-")) throw new Error("Unsafe fixture path"); rmSync(root, { recursive: true, force: true }); }
});
it("failed nullable migration rolls back DDL, data and ledger atomically", () => {
  const root = mkdtempSync(join(tmpdir(), "watchnext-metadata-migration-")), db = new DatabaseSync(":memory:");
  try {
    for (const name of ["0001_initial.sql", "0002_group_sessions.sql"]) cpSync(join(source, name), join(root, name));
    migrate(db, root); db.exec("INSERT INTO groups(id,name) VALUES ('g','Preserved')");
    const before = JSON.stringify(db.prepare("SELECT * FROM schema_migrations").all());
    writeFileSync(join(root, "0003_metadata_lifecycle.sql"), readFileSync(join(source, "0003_metadata_lifecycle.sql"), "utf8") + "\nTHIS IS INVALID SQL;");
    expect(() => migrate(db, root)).toThrow();
    expect(JSON.stringify(db.prepare("SELECT * FROM schema_migrations").all())).toBe(before);
    expect(db.prepare("SELECT name FROM groups").get()?.name).toBe("Preserved");
    expect(db.prepare("PRAGMA table_info(titles)").all().some(row => row.name === "metadata_unavailable")).toBe(false);
  } finally { db.close(); if (dirname(resolve(root)) !== resolve(tmpdir()) || !basename(root).startsWith("watchnext-metadata-migration-")) throw new Error("Unsafe fixture path"); rmSync(root, { recursive: true, force: true }); }
});
