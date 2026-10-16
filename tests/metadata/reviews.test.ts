// @vitest-environment node
import { DatabaseSync } from "node:sqlite";
import { beforeEach, afterEach, expect, it } from "vitest";
import { migrate } from "../../db/migrate";
import { createGroup } from "../../lib/groups";
import { acceptInvitation, requireSession, sessionCookieName } from "../../lib/sessions";
import { changeProfile } from "../../lib/profiles";
import { beginReview, saveReview, selectReviewCandidate, refreshTitleMetadata, type Providers } from "../../lib/metadata/reviews";
import { expireMetadata } from "../../lib/metadata/lifecycle";
import { readTitleDetails } from "../../lib/title-details";
import { readWatchlist } from "../../lib/watchlist";
import { readEditableTitle, editTitle } from "../../lib/edit-title";
import { saveTitle } from "../../lib/shared-save";
import type { ManualTitleInput } from "../../lib/title-validation";
import type { MetadataProvider } from "../../lib/metadata/types";

let db: DatabaseSync, anna: string, max: string, other: string, time: Date, title: string, seconds: number, failure: boolean, providers: Providers;
const origin = "https://watch.example";
const now = () => new Date(time);
const req = (cookie = anna) => new Request(origin, { method: "POST", headers: { origin, cookie: `${sessionCookieName}=${cookie}` } });
const fields = (extra: Partial<ManualTitleInput> = {}): ManualTitleInput => ({ title, contentType: "youtube", minutes: String(seconds / 60), seconds: "0", numberingStyle: "none", genres: "", moods: ["funny"], watchUrl: "https://www.youtube.com/watch?v=YtFixture01", ...extra });
const youtube: MetadataProvider = { namespace: "youtube", async lookup() { return failure ? { kind: "failure", code: "network_error" } : { kind: "item", item: { externalId: "YtFixture01", title, contentType: "youtube", duration: { seconds, meaning: "full_item", verified: true }, sourceUrl: "https://www.youtube.com/watch?v=YtFixture01", watchUrl: "https://www.youtube.com/watch?v=YtFixture01", genres: [] } }; } };
const kinopoisk: MetadataProvider = { namespace: "kinopoisk_unofficial", async lookup(query) {
  return query.kind === "search" ? { kind: "search", candidates: [{ externalId: "1001", title: "Same name", contentType: "movie", year: 2001 }, { externalId: "1002", title: "Same name", contentType: "series", year: 2020 }] } : { kind: "item", item: { externalId: query.externalId, title: "Same name", contentType: query.externalId === "1001" ? "movie" : "series", duration: { seconds: null, verified: false }, sourceUrl: "https://www.kinopoisk.ru/film/1001/", genres: ["Drama"] } };
} };
beforeEach(() => {
  db = new DatabaseSync(":memory:"); migrate(db); time = new Date("2040-01-01T00:00:00.000Z"); title = "Synthetic imported video"; seconds = 120; failure = false; providers = { youtube, kinopoisk_unofficial: kinopoisk };
  const invite = createGroup(db, "Group", origin).inviteUrl.split("/").at(-1)!;
  anna = acceptInvitation(db, invite); max = acceptInvitation(db, invite); other = acceptInvitation(db, createGroup(db, "Other", origin).inviteUrl.split("/").at(-1)!);
  for (const [cookie, name] of [[anna, "Anna"], [max, "Max"], [other, "Other"]]) changeProfile(db, req(cookie), { intent: "create", name, color: "#1d4ed8" }, origin);
});
afterEach(() => db.close());
async function review(cookie = anna) { const result = await beginReview(db, req(cookie), "youtube", "https://youtu.be/YtFixture01", providers, origin, now); if (!result.handle) throw new Error("Expected review"); return result.handle; }
const save = (handle: string, input = fields(), cookie = anna, confirmation?: string) => saveReview(db, req(cookie), handle, input, "https://www.youtube.com/watch?v=YtFixture01", "", confirmation, origin, now);
async function imported(input = fields()) { const result = save(await review(), input); if (result.kind !== "created") throw new Error("Expected created"); return result.id; }
const histories = () => JSON.stringify(["contributors", "progress", "ratings", "notes", "title_moods"].map(table => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()));
function history(id: string) { const a = requireSession(db, anna), b = requireSession(db, max); for (const [member, position, score, note] of [[a.activeMemberId!, 20, 8, "Anna note"], [b.activeMemberId!, 40, 4, "Max note"]] as const) {
  db.prepare("INSERT INTO progress(group_id,title_id,member_id,numbering_style,timestamp_seconds) VALUES (?,?,?,'none',?)").run(a.groupId, id, member, position);
  db.prepare("INSERT INTO ratings(group_id,title_id,member_id,score) VALUES (?,?,?,?)").run(a.groupId, id, member, score);
  db.prepare("INSERT INTO notes(group_id,title_id,member_id,body) VALUES (?,?,?,?)").run(a.groupId, id, member, note);
} }
it("lookup never saves; completed review uses shared save with genuine provider/user origins", async () => {
  const handle = await review(); expect(db.prepare("SELECT * FROM titles").all()).toEqual([]);
  expect(() => save(handle, fields({ moods: [] }))).toThrow();
  const result = save(handle); expect(result.kind).toBe("created");
  expect(db.prepare("SELECT field,origin FROM metadata_fields ORDER BY field").all()).toEqual(expect.arrayContaining([{ field: "title", origin: "provider" }, { field: "duration", origin: "provider" }, { field: "sourceUrl", origin: "provider" }, { field: "genres", origin: "user" }]));
  expect(db.prepare("SELECT * FROM metadata_reviews").all()).toEqual([]);
  expect(() => save(handle)).toThrow();
});
it("explicit corrections remain user-owned; unchanged prefill remains provider-owned", async () => {
  const id = await imported(fields({ title: "My own title", minutes: "3" }));
  expect(db.prepare("SELECT origin FROM metadata_fields WHERE title_id=? AND field='title'").get(id)?.origin).toBe("user");
  expect(db.prepare("SELECT origin FROM metadata_fields WHERE title_id=? AND field='duration'").get(id)?.origin).toBe("user");
  expect(db.prepare("SELECT origin FROM metadata_fields WHERE title_id=? AND field='watchUrl'").get(id)?.origin).toBe("provider");
});
it("ambiguous candidates require separate selected details and manual typical runtime/numbering", async () => {
  const search = await beginReview(db, req(), "kinopoisk_unofficial", "Same name", providers, origin, now);
  expect(search.kind).toBe("candidates"); expect(db.prepare("SELECT * FROM titles").all()).toEqual([]);
  await expect(selectReviewCandidate(db, req(), search.handle, "9999", providers, origin, now)).rejects.toThrow();
  const detail = await selectReviewCandidate(db, req(), search.handle, "1002", providers, origin, now);
  expect(detail).toMatchObject({ kind: "incomplete", item: { duration: { seconds: null }, contentType: "series" } });
  expect(detail).toMatchObject({ item: { provenance: { freshness: { policy: "academic_local_snapshot_30_days", action: "refresh_or_delete" } } } });
  const input = fields({ title: "Same name", contentType: "series", minutes: "24", numberingStyle: "continuous", genres: "Drama", watchUrl: "" });
  const saved = saveReview(db, req(), detail.handle, input, "https://www.kinopoisk.ru/film/1001/", "", undefined, origin, now);
  expect(saved.kind).toBe("created");
  expect(db.prepare("SELECT provider_namespace,provider_id,cover_url,duration_seconds FROM titles").get()).toMatchObject({ provider_namespace: "kinopoisk_unofficial", provider_id: "1002", cover_url: null, duration_seconds: 1440 });
  expect(db.prepare("SELECT origin FROM metadata_fields WHERE field='duration'").get()?.origin).toBe("user");
});
it("fabricated, other-group/member/session, expired and stale-after-profile-switch handles are denied", async () => {
  const handle = await review();
  for (const cookie of [max, other]) expect(() => save(handle, fields(), cookie)).toThrow();
  expect(() => save("x".repeat(43))).toThrow();
  changeProfile(db, req(), { intent: "select", memberId: requireSession(db, max).activeMemberId! }, origin);
  expect(() => save(handle)).toThrow();
  time = new Date(time.getTime() + 11 * 60000); expireMetadata(db, now());
  expect(db.prepare("SELECT * FROM metadata_reviews").all()).toEqual([]);
  expect(() => save(handle)).toThrow();
});
it("duplicate confirmation, attribution and archived restoration use the shared operation without metadata replacement", async () => {
  const manual = saveTitle(db, req(), { kind: "manual", fields: fields() }, origin); if (manual.kind !== "created") throw new Error();
  const handle = await review(max), before = db.prepare("SELECT * FROM titles").get();
  expect(save(handle, fields(), max)).toMatchObject({ kind: "confirmation_required", id: manual.id });
  expect(db.prepare("SELECT * FROM titles").get()).toEqual(before);
  expect(save(handle, fields(), max, manual.id)).toMatchObject({ kind: "existing", id: manual.id });
  expect(db.prepare("SELECT * FROM metadata_fields").all()).toEqual([]);
  history(manual.id); const prior = histories();
  db.exec("UPDATE titles SET archived=1");
  expect(save(await review())).toMatchObject({ kind: "restored", id: manual.id });
  expect(histories()).toBe(prior);
});
it("provenance failure rolls back title/contribution and preserves the review for retry", async () => {
  const handle = await review();
  db.exec("CREATE TRIGGER fail_provenance BEFORE INSERT ON metadata_fields BEGIN SELECT RAISE(ABORT,'synthetic failure'); END");
  expect(() => save(handle)).toThrow();
  expect(db.prepare("SELECT * FROM titles").all()).toEqual([]); expect(db.prepare("SELECT * FROM contributors").all()).toEqual([]);
  expect(db.prepare("SELECT count(*) n FROM metadata_reviews").get()?.n).toBe(1);
  db.exec("DROP TRIGGER fail_provenance"); expect(save(handle).kind).toBe("created");
});
it("before/at/after expiry really deletes acquired values and copies while both histories/user corrections survive", async () => {
  const id = await imported(fields({ title: "User correction" })); history(id); const prior = histories();
  const deadline = db.prepare("SELECT expires_at FROM metadata_fields WHERE title_id=? AND field='duration'").get(id)!.expires_at as string;
  expect(expireMetadata(db, new Date(new Date(deadline).getTime() - 1)).cleared).toBe(0);
  time = new Date(deadline); expect(expireMetadata(db, now()).cleared).toBeGreaterThan(0);
  const row = db.prepare("SELECT * FROM titles").get()!;
  expect(row).toMatchObject({ id, title: "User correction", title_key: "user correction", content_type: null, duration_seconds: null, watch_url: null, source_url: null, metadata_unavailable: 1 });
  expect(histories()).toBe(prior); expect(expireMetadata(db, new Date(time.getTime() + 1)).cleared).toBe(0);
  expect(readTitleDetails(db, req(), id).durationSeconds).toBeNull(); expect(readWatchlist(db, req()).items[0].contentType).toBeNull();
  expect(db.prepare("SELECT * FROM metadata_reviews").all()).toEqual([]);
});
it("successful refresh renews only provider-owned fields; manual corrections and history win", async () => {
  const id = await imported(fields({ title: "User title" })); history(id); const prior = histories();
  time = new Date(time.getTime() + 31 * 86400000); title = "Refreshed provider title"; seconds = 180;
  expect(await refreshTitleMetadata(db, req(), id, providers, origin, now)).toMatchObject({ kind: "available" });
  expect(db.prepare("SELECT title,duration_seconds,content_type,metadata_unavailable FROM titles").get()).toMatchObject({ title: "User title", duration_seconds: 180, content_type: "youtube", metadata_unavailable: 0 });
  expect(histories()).toBe(prior);
  expect(db.prepare("SELECT expires_at FROM metadata_fields WHERE field='duration'").get()?.expires_at).toBe("2040-03-02T00:00:00.000Z");
});
it("failed/unconfigured refresh cannot extend deadline or retain inaccessible expired values", async () => {
  const id = await imported(); history(id); const prior = histories();
  const deadline = db.prepare("SELECT expires_at FROM metadata_fields WHERE field='title'").get()!.expires_at;
  time = new Date(time.getTime() + 31 * 86400000); failure = true;
  expect(await refreshTitleMetadata(db, req(), id, providers, origin, now)).toMatchObject({ code: "network_error" });
  expect(db.prepare("SELECT title,title_key,duration_seconds,source_url,watch_url FROM titles").get()).toMatchObject({ title: null, title_key: null, duration_seconds: null, source_url: null, watch_url: null });
  expect(db.prepare("SELECT expires_at FROM metadata_fields WHERE field='title'").get()?.expires_at).toBe(deadline); expect(histories()).toBe(prior);
});
it("manual correction after expiry needs contributor revision/identity confirmation and preserves compatible history", async () => {
  const id = await imported(); history(id); const prior = histories(); time = new Date(time.getTime() + 31 * 86400000); expireMetadata(db, now());
  const editable = readEditableTitle(db, req(), id);
  expect(editable.values).toMatchObject({ title: "", contentType: "", minutes: "" });
  const input = { fields: fields({ title: "Independent correction", minutes: "3" }), sourceUrl: "", coverUrl: "", revision: editable.revision };
  const confirmation = editTitle(db, req(), id, input, origin); expect(confirmation.kind).toBe("confirmation");
  expect(db.prepare("SELECT title FROM titles").get()?.title).toBeNull();
  if (confirmation.kind !== "confirmation") throw new Error();
  expect(editTitle(db, req(), id, { ...input, confirmation: confirmation.confirmation }, origin).kind).toBe("saved");
  expect(histories()).toBe(prior); expect(db.prepare("SELECT origin FROM metadata_fields WHERE field='title'").get()?.origin).toBe("user");
  expect(editTitle(db, req(), id, input, origin).kind).toBe("stale");
});
