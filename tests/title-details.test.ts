// @vitest-environment node
import { DatabaseSync } from "node:sqlite";
import { beforeEach, afterEach, expect, it } from "vitest";
import { migrate } from "../db/migrate";
import { createGroup } from "../lib/groups";
import { acceptInvitation, requireSession, sessionCookieName } from "../lib/sessions";
import { readTitleDetails } from "../lib/title-details";
import { safeExternalUrl } from "../lib/urls";
let db: DatabaseSync, credential: string, group: string, other: string;
const request = (value = credential) => new Request("https://watch.example", { headers: { cookie: `${sessionCookieName}=${value}` } });
beforeEach(() => {
  db = new DatabaseSync(":memory:"); migrate(db);
  credential = acceptInvitation(db, createGroup(db, "A", "https://watch.example").inviteUrl.split("/").at(-1)!); group = requireSession(db, credential).groupId;
  other = requireSession(db, acceptInvitation(db, createGroup(db, "B", "https://watch.example").inviteUrl.split("/").at(-1)!)).groupId;
  for (const [id, name, color] of [["anna", "Anna", "#1d4ed8"], ["max", "Max", "#0f766e"], ["empty", "Unrecorded", "#6d28d9"]]) db.prepare("INSERT INTO members(id,group_id,name,name_key,avatar_color) VALUES (?,?,?,?,?)").run(id, group, name, name.toLowerCase(), color);
  db.prepare("INSERT INTO titles(id,group_id,title,title_key,content_type,duration_seconds,numbering_style,watch_url,source_url) VALUES ('film',?,'Saved film','saved film','movie',200,'none','https://example.com/watch','https://example.com/source')").run(group);
  for (const member of ["anna", "max"]) db.prepare("INSERT INTO contributors(group_id,title_id,member_id) VALUES (?,'film',?)").run(group, member);
});
afterEach(() => db.close());
it("reads independent history and metadata without requiring selection or modifying records, preserving old oversized timestamps", () => {
  db.prepare("INSERT INTO progress(group_id,title_id,member_id,numbering_style,timestamp_seconds,completed) VALUES (?,'film','anna','none',190,1)").run(group);
  db.prepare("INSERT INTO progress(group_id,title_id,member_id,numbering_style,timestamp_seconds,completed) VALUES (?,'film','max','none',35,0)").run(group);
  db.prepare("INSERT INTO ratings(group_id,title_id,member_id,score) VALUES (?,'film','anna',9)").run(group);
  db.prepare("INSERT INTO notes(group_id,title_id,member_id,body) VALUES (?,'film','max',?)").run(group, "<script>fixture</script>\nSecond line");
  db.exec("UPDATE titles SET duration_seconds=100 WHERE id='film'");
  const snapshot = () => JSON.stringify([db.prepare("SELECT * FROM titles").all(), db.prepare("SELECT * FROM progress").all(), db.prepare("SELECT * FROM ratings").all(), db.prepare("SELECT * FROM notes").all(), db.prepare("SELECT * FROM group_sessions").all()]);
  const before = snapshot(), detail = readTitleDetails(db, request(), "film");
  expect(detail.contributors.map((m) => m.name)).toEqual(["Anna", "Max"]);
  expect(detail.history.find((m) => m.id === "anna")).toMatchObject({ timestampSeconds: 190, completed: true, rating: 9, note: null });
  expect(detail.history.find((m) => m.id === "max")).toMatchObject({ timestampSeconds: 35, completed: false, rating: null, note: "<script>fixture</script>\nSecond line" });
  expect(detail.history.find((m) => m.id === "empty")).toMatchObject({ positionState: null, timestampSeconds: null, completed: null, rating: null, note: null });
  expect(detail.watchUrl).toBe("https://example.com/watch"); expect(detail.sourceUrl).toBe("https://example.com/source"); expect(snapshot()).toBe(before);
});
it("keeps archived details readable and denies unknown, deleted, wrong-group or invalid-session requests equivalently", () => {
  db.exec("UPDATE titles SET archived=1 WHERE id='film'"); expect(readTitleDetails(db, request(), "film").archived).toBe(true);
  db.prepare("INSERT INTO titles(id,group_id,title,title_key,content_type,duration_seconds,numbering_style) VALUES ('private',?,'Private','private','movie',60,'none')").run(other);
  for (const id of ["unknown", "private"]) expect(() => readTitleDetails(db, request(), id)).toThrow("Group access");
  for (const value of ["", "forged"]) expect(() => readTitleDetails(db, request(value), "film")).toThrow("Group access");
  db.exec("DELETE FROM contributors WHERE title_id='film'; DELETE FROM titles WHERE id='film'"); expect(() => readTitleDetails(db, request(), "film")).toThrow("Group access");
});
it("sanitizes every legacy URL field at the server boundary while allowing real HTTP/HTTPS links", () => {
  for (const url of ["javascript:alert(1)", "data:text/html,x", "https://name:password@example.com", "https://example.com/a\nb", "https://example.com/a\u0085b", "https:///example.com", "https://example.com/a\\b", "https:example.com", "not-a-link"]) {
    db.prepare("UPDATE titles SET watch_url=?,source_url=?,cover_url=? WHERE id='film'").run(url, url, url);
    expect(readTitleDetails(db, request(), "film")).toMatchObject({ watchUrl: null, sourceUrl: null, coverUrl: null });
  }
  expect(safeExternalUrl("http://example.com/watch?q=1")).toBe("http://example.com/watch?q=1");
});
