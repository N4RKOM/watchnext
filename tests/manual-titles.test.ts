// @vitest-environment node
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, expect, it } from "vitest";
import { migrate } from "../db/migrate";
import { createGroup } from "../lib/groups";
import { acceptInvitation, credentialHash, sessionCookieName, requireSession } from "../lib/sessions";
import { changeProfile } from "../lib/profiles";
import { saveNewManualTitle, readSavedTitle, validateManualTitle, type ManualTitleInput } from "../lib/manual-titles";
let db: DatabaseSync, a: string, b: string;
const origin = "https://watch.example";
const req = (credential?: string, requestOrigin: string | null = origin) => new Request(origin, { method: "POST", headers: { ...(credential ? { cookie: `${sessionCookieName}=${credential}` } : {}), ...(requestOrigin ? { origin: requestOrigin } : {}) } });
const input = (extra: Partial<ManualTitleInput> = {}): ManualTitleInput => ({ title: "  Film  ", contentType: "movie", minutes: "25", seconds: "1", numberingStyle: "none", genres: "Comedy, comedy, Drama", moods: ["funny", "relaxing"], watchUrl: "", ...extra });
const save = (extra: Partial<ManualTitleInput> = {}) => saveNewManualTitle(db, req(a), input(extra), origin);
beforeEach(() => {
  db = new DatabaseSync(":memory:"); migrate(db);
  a = acceptInvitation(db, createGroup(db, "A", origin).inviteUrl.split("/").at(-1)!);
  b = acceptInvitation(db, createGroup(db, "B", origin).inviteUrl.split("/").at(-1)!);
  for (const credential of [a, b]) changeProfile(db, req(credential), { intent: "create", name: "Anna", color: "#1d4ed8" }, origin);
});
afterEach(() => db.close());
it("persists all four types with exact durations, numbering, metadata and session attribution, without personal progress", () => {
  for (const [type, numbering] of [["movie", "none"], ["youtube", "none"], ["series", "season_episode"], ["anime", "continuous"]]) {
    const id = save({ contentType: type, numberingStyle: numbering });
    expect(readSavedTitle(db, req(a), id)).toMatchObject({ title: "Film", contentType: type, numberingStyle: numbering, durationSeconds: 1501, genres: ["Comedy", "Drama"], moods: ["Funny", "Relaxing"], watchUrl: null, contributors: ["Anna"] });
    expect(db.prepare("SELECT provider_namespace,provider_id,source_url,watch_url,cover_url,archived FROM titles WHERE id=?").get(id)).toMatchObject({ provider_namespace: null, provider_id: null, source_url: null, watch_url: null, cover_url: null, archived: 0 });
    expect(db.prepare("SELECT member_id FROM contributors WHERE title_id=?").get(id)?.member_id).toBe(requireSession(db, a).activeMemberId);
  }
  for (const table of ["progress", "ratings", "notes"]) expect(db.prepare(`SELECT count(*) AS n FROM ${table}`).get()?.n).toBe(0);
});
it("validates exact numeric boundaries without rounding, bounded text, moods, links, genres and numbering", () => {
  const bad: Partial<ManualTitleInput>[] = [
    { title: " " }, { title: "a\0b" }, { title: "x".repeat(201) }, { title: new Blob(["x"]) },
    { contentType: "music" }, { numberingStyle: "continuous" }, { contentType: "series", numberingStyle: "none" },
    { minutes: "-1" }, { minutes: "1.5" }, { minutes: "1e2" }, { minutes: "" }, { minutes: "1441" },
    { minutes: "0", seconds: "0" }, { minutes: "1440", seconds: "1" }, { seconds: "60" }, { seconds: "1.5" },
    { moods: [] }, { moods: ["unknown"] }, { moods: [new Blob(["funny"])] },
    { genres: "Comedy,,Drama" }, { genres: "x".repeat(41) }, { genres: "x\0" }, { genres: Array.from({ length: 11 }, (_, i) => `Genre ${i}`).join(",") },
    ...["javascript:alert(1)", "ftp://example.com", "https://name:password@example.com", "https:example.com", "https://example.com/a\nb"].map((watchUrl) => ({ watchUrl })),
  ];
  for (const value of bad) expect(() => validateManualTitle(input(value)), JSON.stringify(value)).toThrow();
  expect(validateManualTitle(input({ minutes: "0", seconds: "1", genres: " " })).durationSeconds).toBe(1);
  expect(validateManualTitle(input({ minutes: "1440", seconds: "" })).durationSeconds).toBe(86400);
  expect(validateManualTitle(input({ title: "😀".repeat(200), watchUrl: "https://example.com/watch?v=123" })).watchUrl).toBe("https://example.com/watch?v=123");
});
it("normalizes candidate identities including archives and leaves existing contributions/history untouched", () => {
  const id = save({ title: " Ｆilm   night " });
  db.prepare("UPDATE titles SET archived=1 WHERE id=?").run(id);
  const before = JSON.stringify(db.prepare("SELECT * FROM titles").all());
  expect(() => save({ title: "film night" })).toThrow("already saved");
  expect(JSON.stringify(db.prepare("SELECT * FROM titles").all())).toBe(before);
  expect(db.prepare("SELECT count(*) AS n FROM contributors").get()?.n).toBe(1);
  saveNewManualTitle(db, req(b), input({ title: "film night" }), origin);
  expect(db.prepare("SELECT count(*) AS n FROM titles").get()?.n).toBe(2);
});
it("rolls back title/moods/genres/contributor when a late insert fails, and permits retry", () => {
  db.exec("CREATE TEMP TRIGGER fixture_failure AFTER INSERT ON contributors BEGIN SELECT RAISE(ABORT,'PRIVATE_FIXTURE'); END");
  expect(() => save()).toThrow("PRIVATE_FIXTURE");
  for (const table of ["titles", "title_moods", "title_genres", "contributors"]) expect(db.prepare(`SELECT count(*) AS n FROM ${table}`).get()?.n).toBe(0);
  db.exec("DROP TRIGGER fixture_failure"); expect(save()).toEqual(expect.any(String));
});
it("maps an identity uniqueness race to an explicit collision without a partial save", () => {
  db.exec("CREATE TEMP TRIGGER fixture_conflict BEFORE INSERT ON titles BEGIN SELECT RAISE(ABORT,'UNIQUE constraint failed: titles.group_id, titles.content_type, titles.title_key'); END");
  expect(() => save()).toThrow("already saved"); expect(db.prepare("SELECT count(*) AS n FROM titles").get()?.n).toBe(0);
});
it("rejects forged ownership, sessions, origins, missing/stale profiles and cross-group readback without writes", () => {
  const id = save();
  const snapshot = () => JSON.stringify([db.prepare("SELECT * FROM titles").all(), db.prepare("SELECT * FROM contributors").all(), db.prepare("SELECT * FROM group_sessions").all()]);
  const before = snapshot();
  for (const request of [req(), req("forged"), req(a, null), req(a, "https://evil.example")]) expect(() => saveNewManualTitle(db, request, input({ title: "Denied" }), origin)).toThrow("Group access");
  for (const extra of [{ groupId: requireSession(db, b).groupId }, { memberId: requireSession(db, b).activeMemberId }]) expect(() => save(extra)).toThrow("Group access");
  expect(() => readSavedTitle(db, req(b), id)).toThrow("Group access"); expect(snapshot()).toBe(before);
  db.prepare("UPDATE group_sessions SET active_member_id=NULL WHERE token_hash=?").run(credentialHash(a)); expect(() => save()).toThrow("Group access");
  db.exec("PRAGMA foreign_keys=OFF"); db.prepare("UPDATE group_sessions SET active_member_id='stale' WHERE token_hash=?").run(credentialHash(a)); db.exec("PRAGMA foreign_keys=ON"); expect(() => save()).toThrow("Group access");
});
