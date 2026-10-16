// @vitest-environment node
import { DatabaseSync } from "node:sqlite";
import { beforeEach, afterEach, expect, it } from "vitest";
import { migrate } from "../db/migrate";
import { createGroup } from "../lib/groups";
import { acceptInvitation, requireSession, sessionCookieName, credentialHash } from "../lib/sessions";
import { changeProfile } from "../lib/profiles";
import { saveTitle, type SaveInput } from "../lib/shared-save";
import type { ManualTitleInput } from "../lib/title-validation";
let db: DatabaseSync, anna: string, max: string, other: string;
const origin = "https://watch.example";
const req = (credential?: string, requestOrigin: string | null = origin) => new Request(origin, { method: "POST", headers: { ...(credential ? { cookie: `${sessionCookieName}=${credential}` } : {}), ...(requestOrigin ? { origin: requestOrigin } : {}) } });
const fields = (extra: Partial<ManualTitleInput> = {}): ManualTitleInput => ({ title: "Dune", contentType: "movie", minutes: "100", seconds: "", numberingStyle: "none", genres: "Drama", moods: ["exciting"], watchUrl: "https://example.com/watch", ...extra });
const manual = (extra: Partial<ManualTitleInput> = {}, confirmationId?: unknown): SaveInput => ({ kind: "manual", fields: fields(extra), ...(confirmationId !== undefined ? { confirmationId } : {}) });
const provider = (extra: Partial<ManualTitleInput> = {}, namespace = "youtube", externalId = "same-id", confirmationId?: unknown): SaveInput => ({ kind: "provider", fields: fields(extra), provider: { namespace, externalId, sourceUrl: "https://example.com/source", coverUrl: "https://example.com/cover.png" }, ...(confirmationId !== undefined ? { confirmationId } : {}) });
const save = (credential: string, input: SaveInput = manual()) => saveTitle(db, req(credential), input, origin);
beforeEach(() => {
  db = new DatabaseSync(":memory:"); migrate(db);
  const invite = createGroup(db, "A", origin).inviteUrl.split("/").at(-1)!;
  anna = acceptInvitation(db, invite); max = acceptInvitation(db, invite); other = acceptInvitation(db, createGroup(db, "B", origin).inviteUrl.split("/").at(-1)!);
  for (const [credential, name] of [[anna, "Anna"], [max, "Max"], [other, "Other"]]) changeProfile(db, req(credential), { intent: "create", name, color: "#1d4ed8" }, origin);
});
afterEach(() => db.close());
const snapshot = () => JSON.stringify(["titles", "title_moods", "title_genres", "contributors", "progress", "ratings", "notes"].map((table) => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()));
it("known provider saves share one identity and idempotent contributors without metadata/history/time replacement", () => {
  const first = save(anna, provider()); if (first.kind !== "created") throw new Error("Expected new fixture");
  const context = requireSession(db, anna);
  db.prepare("INSERT INTO progress(group_id,title_id,member_id,numbering_style,timestamp_seconds,completed) VALUES (?,?,?,'none',40,1)").run(context.groupId, first.id, context.activeMemberId!);
  db.prepare("INSERT INTO ratings(group_id,title_id,member_id,score) VALUES (?,?,?,9)").run(context.groupId, first.id, context.activeMemberId!);
  db.prepare("INSERT INTO notes(group_id,title_id,member_id,body) VALUES (?,?,?,'Retained note')").run(context.groupId, first.id, context.activeMemberId!);
  const maxMember = requireSession(db, max).activeMemberId!;
  db.prepare("INSERT INTO progress(group_id,title_id,member_id,numbering_style,timestamp_seconds,completed) VALUES (?,?,?,'none',12,0)").run(context.groupId, first.id, maxMember);
  db.prepare("INSERT INTO ratings(group_id,title_id,member_id,score) VALUES (?,?,?,4)").run(context.groupId, first.id, maxMember);
  db.prepare("INSERT INTO notes(group_id,title_id,member_id,body) VALUES (?,?,?,'Different Max note')").run(context.groupId, first.id, maxMember);
  const histories = () => JSON.stringify(["progress", "ratings", "notes"].map((table) => db.prepare(`SELECT * FROM ${table} ORDER BY member_id`).all()));
  const historyBefore = histories();
  const oldTitle = db.prepare("SELECT * FROM titles").get(), oldMoods = db.prepare("SELECT * FROM title_moods").all(), oldGenres = db.prepare("SELECT * FROM title_genres").all();
  expect(save(max, provider({ title: "Different incoming metadata", minutes: "10", genres: "Comedy", moods: ["funny"], watchUrl: "" }))).toMatchObject({ kind: "existing", id: first.id, alreadyAdded: false });
  expect(db.prepare("SELECT * FROM titles").get()).toEqual(oldTitle); expect(db.prepare("SELECT * FROM title_moods").all()).toEqual(oldMoods); expect(db.prepare("SELECT * FROM title_genres").all()).toEqual(oldGenres);
  expect(histories()).toBe(historyBefore);
  const before = snapshot(); expect(save(anna, provider())).toMatchObject({ kind: "existing", id: first.id, alreadyAdded: true });expect(save(max, provider())).toMatchObject({ kind: "existing", id: first.id, alreadyAdded: true });expect(snapshot()).toBe(before);
  expect(db.prepare("SELECT count(*) AS n FROM titles").get()?.n).toBe(1);expect(db.prepare("SELECT count(*) AS n FROM contributors").get()?.n).toBe(2);
});
it("manual matching requires confirmation; cancellation writes nothing; distinctive works stay separate", () => {
  const first = save(anna, manual()); const before = snapshot();
  expect(save(max, manual({ title: "  ＤUNE  " }))).toMatchObject({ kind: "confirmation_required", id: first.id });expect(snapshot()).toBe(before);
  expect(save(max, manual({ title: " Dune " }, first.id))).toMatchObject({ kind: "existing", id: first.id, alreadyAdded: false });
  expect(save(max, manual())).toMatchObject({ kind: "existing", alreadyAdded: true });expect(save(max, manual({ title: "Dune (1984)" })).kind).toBe("created");
});
it("attaches only a confirmed unoccupied provider identity to a manual match without overwriting metadata", () => {
  const first = save(anna, manual()); const before = db.prepare("SELECT * FROM titles").get();
  expect(save(max, provider())).toMatchObject({ kind: "confirmation_required", id: first.id });expect(db.prepare("SELECT * FROM titles").get()).toEqual(before);
  expect(save(max, provider({ minutes: "1", moods: ["funny"] }, "kinopoisk_unofficial", "42", first.id))).toMatchObject({ kind: "existing", id: first.id });
  expect(db.prepare("SELECT * FROM titles").get()).toEqual({ ...before, provider_namespace: "kinopoisk_unofficial", provider_id: "42" });
});
it("never merges equal-looking IDs across namespaces/groups and reports protected name/identity conflicts", () => {
  const first = save(anna, provider());
  expect(save(max, provider({}, "kinopoisk_unofficial"))).toMatchObject({ kind: "identity_conflict", id: first.id });
  expect(save(max, provider({ title: "Another work" }, "kinopoisk_unofficial"))).toMatchObject({ kind: "created" });
  expect(save(other, provider())).toMatchObject({ kind: "created" });expect(db.prepare("SELECT count(*) AS n FROM titles").get()?.n).toBe(3);
  const candidate = save(anna, manual({ title: "Manual target" })); const before = snapshot();
  expect(save(max, provider({ title: "Manual target" }, "youtube", "same-id", candidate.id))).toMatchObject({ kind: "identity_conflict", id: first.id });expect(snapshot()).toBe(before);
});
it("returns archived matches unchanged for manual and known provider saves without adding/restoring", () => {
  const first = save(anna, provider()); if (first.kind !== "created") throw new Error("Expected new fixture");db.prepare("UPDATE titles SET archived=1 WHERE id=?").run(first.id);const before = snapshot();
  expect(save(max, provider())).toMatchObject({ kind: "archived_match", id: first.id });expect(save(max, manual({}, first.id))).toMatchObject({ kind: "archived_match", id: first.id });expect(snapshot()).toBe(before);
});
it("revalidates changed input, wrong-group/stale candidates and current ownership/origin before any write", () => {
  const first = save(anna, manual()), foreign = save(other, manual()); const before = snapshot();
  for (const id of [foreign.id, "deleted", 12]) expect(() => save(max, manual({}, id))).toThrow("Group access");
  expect(() => save(max, manual({ title: "Changed work" }, first.id))).toThrow("Group access");
  for (const request of [req(), req("forged"), req(max, null), req(max, "https://evil.example")]) expect(() => saveTitle(db, request, manual(), origin)).toThrow("Group access");
  expect(() => save(max, manual({ groupId: requireSession(db, other).groupId }))).toThrow("Group access");expect(() => save(max, manual({ memberId: requireSession(db, anna).activeMemberId }))).toThrow("Group access");expect(snapshot()).toBe(before);
  db.prepare("UPDATE group_sessions SET active_member_id=NULL WHERE token_hash=?").run(credentialHash(max)); expect(() => save(max)).toThrow("Group access");
});
it("rolls back a failed new save and a failed contributor/identity attachment, then retries cleanly", () => {
  db.exec("CREATE TEMP TRIGGER fixture_failure AFTER INSERT ON contributors BEGIN SELECT RAISE(ABORT,'PRIVATE_FIXTURE'); END");expect(() => save(anna, provider())).toThrow("PRIVATE_FIXTURE");expect(db.prepare("SELECT count(*) AS n FROM titles").get()?.n).toBe(0);db.exec("DROP TRIGGER fixture_failure");
  const first = save(anna, manual()), before = snapshot();db.exec("CREATE TEMP TRIGGER fixture_failure AFTER INSERT ON contributors BEGIN SELECT RAISE(ABORT,'PRIVATE_FIXTURE'); END");
  expect(() => save(max, provider({}, "youtube", "same-id", first.id))).toThrow("PRIVATE_FIXTURE");expect(snapshot()).toBe(before);db.exec("DROP TRIGGER fixture_failure");expect(save(max, provider({}, "youtube", "same-id", first.id))).toMatchObject({ kind: "existing", id: first.id });
});
it("rejects invalid provider pairs and unsafe source metadata without writes", () => {
  for (const identity of [{ namespace: "", externalId: "id" }, { namespace: "YouTube", externalId: "id" }, { namespace: "youtube", externalId: " " }, { namespace: "youtube", externalId: "a\0b" }, { namespace: "youtube", externalId: "id", sourceUrl: "javascript:x" }]) {
    expect(() => save(anna, { kind: "provider", fields: fields(), provider: identity })).toThrow("provider identity");
  }
  expect(db.prepare("SELECT count(*) AS n FROM titles").get()?.n).toBe(0);
});
