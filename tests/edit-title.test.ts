// @vitest-environment node
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, expect, it } from "vitest";
import { migrate } from "../db/migrate";
import { createGroup } from "../lib/groups";
import { acceptInvitation, requireSession, sessionCookieName, credentialHash } from "../lib/sessions";
import { changeProfile } from "../lib/profiles";
import { saveTitle } from "../lib/shared-save";
import { editTitle, readEditableTitle } from "../lib/edit-title";
import { readTitleDetails } from "../lib/title-details";
import type { MetadataValues } from "../lib/title-state";
let db: DatabaseSync, anna: string, max: string, viewer: string, foreign: string, id: string, privateId: string;
const origin = "https://watch.example";
const req = (credential?: string, requestOrigin: string | null = origin) => new Request(origin, { method: "POST", headers: { ...(credential ? { cookie: `${sessionCookieName}=${credential}` } : {}), ...(requestOrigin ? { origin: requestOrigin } : {}) } });
const initial = { title: "Film", contentType: "movie", minutes: "90", seconds: "", numberingStyle: "none", genres: "Drama", moods: ["funny"], watchUrl: "https://example.com/watch" };
beforeEach(() => {
  db = new DatabaseSync(":memory:"); migrate(db);
  const invite = createGroup(db, "A", origin).inviteUrl.split("/").at(-1)!;
  anna = acceptInvitation(db, invite);max = acceptInvitation(db, invite);viewer = acceptInvitation(db, invite);foreign = acceptInvitation(db, createGroup(db, "B", origin).inviteUrl.split("/").at(-1)!);
  for (const [credential, name] of [[anna, "Anna"], [max, "Max"], [viewer, "Viewer"], [foreign, "Other"]]) changeProfile(db, req(credential), { intent: "create", name, color: "#1d4ed8" }, origin);
  for (const credential of [anna, max, foreign]) {
    const result = saveTitle(db, req(credential), { kind: "provider", fields: initial, provider: { namespace: "youtube", externalId: "fixture", sourceUrl: "https://example.com/source", coverUrl: "https://example.com/cover.png" } }, origin);
    if (!result.id) throw new Error("Fixture setup failed");if (credential === foreign) privateId = result.id;else id = result.id;
  }
});
afterEach(() => db.close());
function input(credential = anna, values: Partial<MetadataValues> = {}) {
  const model = readEditableTitle(db, req(credential), id), next = { ...model.values, ...values };
  return { fields: { ...next, moods: model.moods }, sourceUrl: next.sourceUrl, coverUrl: next.coverUrl, revision: model.revision };
}
const snapshot = () => JSON.stringify(["titles", "title_moods", "title_genres", "contributors", "progress", "ratings", "notes"].map((table) => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()));
it("preloads all fields and lets either contributor edit shared metadata with immutable identity/times/attribution", () => {
  expect(readEditableTitle(db, req(max), id).values).toMatchObject({ title: "Film", minutes: "90", seconds: "0", genres: "Drama", sourceUrl: "https://example.com/source", coverUrl: "https://example.com/cover.png" });
  const before = db.prepare("SELECT group_id,created_at,provider_namespace,provider_id,archived FROM titles WHERE id=?").get(id), contributors = db.prepare("SELECT * FROM contributors ORDER BY rowid").all();
  const payload = input(anna, { minutes: "60", genres: "Comedy, Drama", watchUrl: "", sourceUrl: "", coverUrl: "" });payload.fields.moods = ["relaxing", "emotional"];
  expect(editTitle(db, req(anna), id, payload, origin)).toMatchObject({ kind: "saved", id });expect(editTitle(db, req(max), id, input(max, { seconds: "1" }), origin).kind).toBe("saved");
  expect(db.prepare("SELECT group_id,created_at,provider_namespace,provider_id,archived FROM titles WHERE id=?").get(id)).toEqual(before);expect(db.prepare("SELECT * FROM contributors ORDER BY rowid").all()).toEqual(contributors);
  expect(db.prepare("SELECT duration_seconds,watch_url,source_url,cover_url FROM titles WHERE id=?").get(id)).toMatchObject({ duration_seconds: 3601, watch_url: null, source_url: null, cover_url: null });
});
it("denies noncontributors, no profile, bad sessions/claims/origins, cross-group targets and tampered provider identity without changes", () => {
  const payload = input(), before = snapshot();
  for (const credential of [viewer, foreign, undefined, "forged"]) {
    expect(() => readEditableTitle(db, req(credential), id)).toThrow("Group access");expect(() => editTitle(db, req(credential), id, payload, origin)).toThrow("Group access");
  }
  expect(() => editTitle(db, req(anna), privateId, payload, origin)).toThrow("Group access");
  for (const requestOrigin of [null, "https://evil.example"]) expect(() => editTitle(db, req(anna, requestOrigin), id, payload, origin)).toThrow("Group access");
  expect(() => editTitle(db, req(anna), id, { ...payload, fields: { ...payload.fields, memberId: requireSession(db, max).activeMemberId } }, origin)).toThrow("Group access");
  expect(() => editTitle(db, req(anna), id, { ...payload, immutableClaims: ["providerId"] }, origin)).toThrow("Group access");
  expect(() => editTitle(db, req(anna), id, { ...payload, fields: Object.assign({}, payload.fields, { provider_namespace: "other" }) }, origin)).toThrow("Group access");expect(snapshot()).toBe(before);
  db.prepare("UPDATE group_sessions SET active_member_id=NULL WHERE token_hash=?").run(credentialHash(anna));expect(() => readEditableTitle(db, req(anna), id)).toThrow("Group access");
});
it("requires exact proposal identity confirmation, permits case-only changes and blocks active/archived name collisions", () => {
  const payload = input(anna, { title: "Another title" }), before = snapshot(), result = editTitle(db, req(anna), id, payload, origin);
  expect(result.kind).toBe("confirmation");expect(snapshot()).toBe(before);if (result.kind !== "confirmation") throw new Error("Expected confirmation");
  expect(editTitle(db, req(anna), id, { ...payload, fields: { ...payload.fields, title: "Different proposal" }, confirmation: result.confirmation }, origin).kind).toBe("confirmation");
  expect(editTitle(db, req(anna), id, { ...payload, confirmation: result.confirmation }, origin).kind).toBe("saved");
  expect(editTitle(db, req(anna), id, input(anna, { title: "ANOTHER TITLE" }), origin).kind).toBe("saved");
  const another = saveTitle(db, req(anna), { kind: "manual", fields: { ...initial, title: "Occupied" } }, origin);if (!another.id) throw new Error("Fixture failed");db.prepare("UPDATE titles SET archived=1 WHERE id=?").run(another.id);
  const collisionBefore = snapshot();expect(() => editTitle(db, req(anna), id, input(anna, { title: "occupied" }), origin)).toThrow("already uses");expect(snapshot()).toBe(collisionBefore);
});
it("blocks type/numbering changes after history but allows duration correction without touching independent history", () => {
  for (const credential of [anna, max]) {
    const context = requireSession(db, credential);
    db.prepare("INSERT INTO progress(group_id,title_id,member_id,numbering_style,timestamp_seconds,completed) VALUES (?,?,?,'none',4200,1)").run(context.groupId, id, context.activeMemberId!);
    db.prepare("INSERT INTO ratings(group_id,title_id,member_id,score) VALUES (?,?,?,8)").run(context.groupId, id, context.activeMemberId!);
    db.prepare("INSERT INTO notes(group_id,title_id,member_id,body) VALUES (?,?,?,'Preserved note')").run(context.groupId, id, context.activeMemberId!);
  }
  const histories = () => JSON.stringify(["progress", "ratings", "notes"].map((table) => db.prepare(`SELECT * FROM ${table} ORDER BY member_id`).all())), before = histories();
  expect(() => editTitle(db, req(anna), id, input(anna, { contentType: "series", numberingStyle: "season_episode" }), origin)).toThrow("cannot change after");
  expect(editTitle(db, req(max), id, input(max, { minutes: "60" }), origin).kind).toBe("saved");expect(histories()).toBe(before);expect(readTitleDetails(db, req(anna), id).history.find((m) => m.name === "Anna")?.timestampSeconds).toBe(4200);
});
it("permits validated type/numbering changes before any history, with identity confirmation", () => {
  const payload = input(anna, { contentType: "series", numberingStyle: "season_episode" }), result = editTitle(db, req(anna), id, payload, origin);if (result.kind !== "confirmation") throw new Error("Expected identity confirmation");
  expect(editTitle(db, req(anna), id, { ...payload, confirmation: result.confirmation }, origin).kind).toBe("saved");
  expect(editTitle(db, req(max), id, input(max, { numberingStyle: "continuous" }), origin).kind).toBe("saved");
});
it("detects a stale editor from metadata/associations and rechecks removed contribution/archive/history at commit", () => {
  const stale = input(max, { minutes: "20" });expect(editTitle(db, req(anna), id, input(anna, { minutes: "30" }), origin).kind).toBe("saved");const before = snapshot();
  expect(editTitle(db, req(max), id, stale, origin)).toMatchObject({ kind: "stale" });expect(snapshot()).toBe(before);
  const current = input(max);db.prepare("DELETE FROM contributors WHERE title_id=? AND member_id=?").run(id, requireSession(db, max).activeMemberId!);expect(() => editTitle(db, req(max), id, current, origin)).toThrow("Group access");
  const annaInput=input(anna);db.prepare("UPDATE titles SET archived=1 WHERE id=?").run(id);expect(() => editTitle(db, req(anna), id, annaInput, origin)).toThrow("Group access");
});
it("rejects invalid fields/URLs and rolls back complete metadata/association updates on storage failure, then retries", () => {
  const payload = input(anna, { minutes: "25", genres: "Comedy" }), before = snapshot();
  for (const bad of [{ ...payload, fields: { ...payload.fields, minutes: "1.5" } }, { ...payload, sourceUrl: "javascript:alert(1)" }, { ...payload, coverUrl: "https://name:password@example.com" }]) expect(() => editTitle(db, req(anna), id, bad, origin)).toThrow();expect(snapshot()).toBe(before);
  db.exec("CREATE TEMP TRIGGER fixture_failure BEFORE INSERT ON title_moods BEGIN SELECT RAISE(ABORT,'PRIVATE_FIXTURE'); END");expect(() => editTitle(db, req(anna), id, payload, origin)).toThrow("PRIVATE_FIXTURE");expect(snapshot()).toBe(before);db.exec("DROP TRIGGER fixture_failure");expect(editTitle(db, req(anna), id, payload, origin).kind).toBe("saved");
});
