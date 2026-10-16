// @vitest-environment node
import { DatabaseSync } from "node:sqlite";
import { beforeEach, afterEach, expect, it } from "vitest";
import { migrate } from "../db/migrate";
import { createGroup } from "../lib/groups";
import { acceptInvitation, credentialHash, sessionCookieName, requireSession } from "../lib/sessions";
import { readWatchlist } from "../lib/watchlist";
import { readSavedTitle } from "../lib/manual-titles";
let db: DatabaseSync, credential: string, group: string, other: string;
const request = (value = credential) => new Request("https://watch.example", { headers: { cookie: `${sessionCookieName}=${value}` } });
beforeEach(() => {
  db = new DatabaseSync(":memory:"); migrate(db);
  credential = acceptInvitation(db, createGroup(db, "A", "https://watch.example").inviteUrl.split("/").at(-1)!); group = requireSession(db, credential).groupId;
  other = requireSession(db, acceptInvitation(db, createGroup(db, "B", "https://watch.example").inviteUrl.split("/").at(-1)!)).groupId;
});
afterEach(() => db.close());
function title(id: string, groupId = group, archived = 0, created = "2026-01-01", type = "movie", numbering = "none") {
  db.prepare("INSERT INTO titles(id,group_id,title,title_key,content_type,duration_seconds,numbering_style,archived,created_at) VALUES (?,?,?,?,?,1501,?,?,?)").run(id, groupId, id, id, type, numbering, archived, created);
}
it("reads an honest empty group with no selected profile, and denies invalid group access", () => {
  expect(readWatchlist(db, request())).toEqual({ activeMemberId: null, items: [] });
  for (const value of ["", "forged"]) expect(() => readWatchlist(db, request(value))).toThrow("Group access");
  db.prepare("DELETE FROM group_sessions WHERE token_hash=?").run(credentialHash(credential)); expect(() => readWatchlist(db, request())).toThrow("Group access");
});
it("returns one active row per title with every contributor/color and mood, excluding archives and other groups", () => {
  title("shared"); title("archived", group, 1); title("private-other", other);
  for (const [id, name, color] of [["anna", "Anna", "#1d4ed8"], ["max", "Max", "#0f766e"]]) {
    db.prepare("INSERT INTO members(id,group_id,name,name_key,avatar_color) VALUES (?,?,?,?,?)").run(id, group, name, name.toLowerCase(), color);
    db.prepare("INSERT INTO contributors(group_id,title_id,member_id) VALUES (?,'shared',?)").run(group, id);
  }
  for (const mood of ["funny", "relaxing"]) db.prepare("INSERT INTO title_moods(title_id,mood_code) VALUES ('shared',?)").run(mood);
  const view = readWatchlist(db, request()); expect(view.items).toHaveLength(1);
  expect(view.items[0]).toMatchObject({ id: "shared", durationSeconds: 1501, moods: ["Funny", "Relaxing"], contributors: [{ id: "anna", name: "Anna", color: "#1d4ed8" }, { id: "max", name: "Max", color: "#0f766e" }] });
});
it("orders by creation descending then ID ascending, unaffected by later contributors", () => {
  title("older"); title("b", group, 0, "2026-02-01", "anime", "continuous"); title("a", group, 0, "2026-02-01", "series", "season_episode");
  db.prepare("INSERT INTO members(id,group_id,name,name_key,avatar_color) VALUES ('latest',?,'Later','later','#1d4ed8')").run(group);
  db.prepare("INSERT INTO contributors(group_id,title_id,member_id,created_at) VALUES (?,'older','latest','2026-03-01')").run(group);
  expect(readWatchlist(db, request()).items.map((item) => item.id)).toEqual(["a", "b", "older"]);
});
it("rejects an archived saved-summary ID while preserving its title and all history", () => {
  title("archive", group, 1);
  db.prepare("INSERT INTO members(id,group_id,name,name_key,avatar_color) VALUES ('anna',?,'Anna','anna','#1d4ed8')").run(group);
  db.prepare("UPDATE group_sessions SET active_member_id='anna' WHERE token_hash=?").run(credentialHash(credential));
  db.prepare("INSERT INTO ratings(group_id,title_id,member_id,score) VALUES (?,'archive','anna',8)").run(group);
  expect(() => readSavedTitle(db, request(), "archive")).toThrow("Group access");
  expect(db.prepare("SELECT score FROM ratings WHERE title_id='archive'").get()?.score).toBe(8);
  expect(db.prepare("SELECT archived FROM titles WHERE id='archive'").get()?.archived).toBe(1);
});
