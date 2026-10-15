// @vitest-environment node
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, expect, it } from "vitest";
import { migrate } from "../db/migrate";
import { createGroup } from "../lib/groups";
import { acceptInvitation, credentialHash, requireSession, sessionCookieName } from "../lib/sessions";
import { changeProfile, getProfileView, normalizeProfileName } from "../lib/profiles";

let db: DatabaseSync, a: string, b: string, a2: string, groupA: string, groupB: string;
const origin = "https://watch.example";
const request = (credential: string | undefined, originValue: string | null = origin) => new Request(origin, { method: "POST", headers: {
  ...(credential ? { cookie: `${sessionCookieName}=${credential}` } : {}), ...(originValue ? { origin: originValue } : {}),
} });
const create = (session: string, name: unknown, color: unknown = "#1d4ed8") => changeProfile(db, request(session), { intent: "create", name, color }, origin);
beforeEach(() => {
  db = new DatabaseSync(":memory:"); migrate(db);
  const inviteA = createGroup(db, "A", origin).inviteUrl.split("/").at(-1)!;
  a = acceptInvitation(db, inviteA); a2 = acceptInvitation(db, inviteA);
  b = acceptInvitation(db, createGroup(db, "B", origin).inviteUrl.split("/").at(-1)!);
  groupA = requireSession(db, a).groupId; groupB = requireSession(db, b).groupId;
});
afterEach(() => db.close());

it("normalizes names, activates atomically and enforces group uniqueness plus the exact palette", () => {
  const result = create(a, "  Ａnna\t Film  ", "#6d28d9");
  expect(result.members[0].name).toBe("Anna Film");
  expect(result.members[0].color).toBe("#6d28d9");
  expect(result.activeMemberId).toBe(result.members[0].id);
  expect(db.prepare("SELECT name_key FROM members").get()?.name_key).toBe("anna film");
  expect(() => create(a, "ANNA  FILM")).toThrow("already used");
  create(b, "Anna Film");
  expect(db.prepare("SELECT count(*) AS count FROM members").get()?.count).toBe(2);
  for (const name of ["", " \t ", "x".repeat(41), "a\0b", null, 12, new Blob(["name"])]) expect(() => create(a, name)).toThrow();
  for (const color of ["red", "#123456", "#1D4ED8", "", null]) expect(() => create(a, "Different", color)).toThrow("six available colors");
  expect(normalizeProfileName("😀".repeat(40))).toBe("😀".repeat(40));
  expect(() => normalizeProfileName("😀".repeat(41))).toThrow();
});

it("rolls back a member if activation fails and then allows a clean retry", () => {
  db.exec("CREATE TEMP TRIGGER fail_activation BEFORE UPDATE ON group_sessions BEGIN SELECT RAISE(ABORT,'Fixture failure'); END;");
  expect(() => create(a, "Retry")).toThrow("Fixture failure");
  expect(db.prepare("SELECT count(*) AS count FROM members").get()?.count).toBe(0);
  expect(requireSession(db, a).activeMemberId).toBeNull();
  db.exec("DROP TRIGGER fail_activation");
  expect(create(a, "Retry").activeMemberId).not.toBeNull();
});

it("selects only in the current browser and leaves progress and feedback untouched", () => {
  const first = create(a, "Anna").members[0];
  const second = create(a, "Max", "#0f766e").members.find((member) => member.name === "Max")!;
  db.prepare("INSERT INTO titles(id,group_id,title,title_key,content_type,duration_seconds,numbering_style) VALUES ('fixture',?,'Fixture','fixture','movie',100,'none')").run(groupA);
  db.prepare("INSERT INTO ratings(group_id,title_id,member_id,score) VALUES (?,'fixture',?,8)").run(groupA, first.id);
  db.prepare("INSERT INTO notes(group_id,title_id,member_id,body) VALUES (?,'fixture',?,'Retained fixture')").run(groupA, second.id);
  db.prepare("INSERT INTO progress(group_id,title_id,member_id,numbering_style,timestamp_seconds) VALUES (?,'fixture',?,'none',20)").run(groupA, first.id);
  changeProfile(db, request(a2), { intent: "select", memberId: first.id }, origin);
  expect(requireSession(db, a).activeMemberId).toBe(second.id);
  expect(requireSession(db, a2).activeMemberId).toBe(first.id);
  changeProfile(db, request(a), { intent: "select", memberId: first.id }, origin);
  expect(db.prepare("SELECT score FROM ratings").get()?.score).toBe(8);
  expect(db.prepare("SELECT body FROM notes").get()?.body).toBe("Retained fixture");
  expect(db.prepare("SELECT timestamp_seconds FROM progress").get()?.timestamp_seconds).toBe(20);
});

it("rejects absent/forged sessions, payload group claims, cross-origin requests and other-group members without changes", () => {
  const other = create(b, "Other").members[0];
  const before = JSON.stringify([db.prepare("SELECT * FROM members ORDER BY id").all(), db.prepare("SELECT * FROM group_sessions ORDER BY token_hash").all()]);
  for (const req of [request(undefined), request("forged"), request(a, null), request(a, "https://evil.example")]) {
    expect(() => changeProfile(db, req, { intent: "create", name: "Wrong", color: "#1d4ed8" }, origin)).toThrow("Group access");
  }
  expect(() => changeProfile(db, request(a), { intent: "create", name: "Wrong", color: "#1d4ed8", groupId: groupB }, origin)).toThrow("Group access");
  expect(() => changeProfile(db, request(a), { intent: "select", memberId: other.id, groupId: groupA }, origin)).toThrow("Group access");
  expect(JSON.stringify([db.prepare("SELECT * FROM members ORDER BY id").all(), db.prepare("SELECT * FROM group_sessions ORDER BY token_hash").all()])).toBe(before);
});

it("treats deleted/wrong-group selected references as no selection without leaking members or modifying history", () => {
  const other = create(b, "Private other").members[0];
  db.exec("PRAGMA foreign_keys=OFF");
  db.prepare("UPDATE group_sessions SET active_member_id=? WHERE token_hash=?").run(other.id, credentialHash(a));
  db.exec("PRAGMA foreign_keys=ON");
  expect(getProfileView(db, request(a))).toEqual({ members: [], activeMemberId: null });
  db.exec("PRAGMA foreign_keys=OFF");
  db.prepare("UPDATE group_sessions SET active_member_id='deleted' WHERE token_hash=?").run(credentialHash(a));
  db.exec("PRAGMA foreign_keys=ON");
  expect(getProfileView(db, request(a))).toEqual({ members: [], activeMemberId: null });
  expect(db.prepare("SELECT name FROM members WHERE id=?").get(other.id)?.name).toBe("Private other");
});
