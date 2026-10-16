// @vitest-environment node
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, expect, it } from "vitest";
import { migrate } from "../db/migrate";
import { createGroup } from "../lib/groups";
import { acceptInvitation, requireSession, sessionCookieName } from "../lib/sessions";
import { changeProfile } from "../lib/profiles";
import { saveTitle } from "../lib/shared-save";
import { removeOwnContribution, restoreTitle } from "../lib/contributions";
import { readTitleDetails } from "../lib/title-details";
import { parseRating, RatingFieldError, readOwnRating, updateOwnRating } from "../lib/ratings";
let db: DatabaseSync, anna: string, max: string, viewer: string, other: string, movie: string, series: string, otherTitle: string;
const origin = "https://watch.example";
const req = (cookie = anna, source = origin) => new Request(origin, { method: "POST", headers: { origin: source, cookie: `${sessionCookieName}=${cookie}` } });
const input = (extra: Record<string, unknown> = {}, cookie = anna) => ({ intent: "save_rating", memberId: requireSession(db, cookie).activeMemberId!, score: "8", ...extra });
const write = (extra: Record<string, unknown> = {}, id = movie, cookie = anna) => updateOwnRating(db, req(cookie), id, input(extra, cookie), origin);
const all = () => JSON.stringify(["titles", "contributors", "progress", "ratings", "notes", "title_moods", "title_genres", "metadata_fields"].map(table => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()));
function saved(title: string, type: string, style: string, cookie = anna) { const result = saveTitle(db, req(cookie), { kind: "manual", fields: { title, contentType: type, minutes: "90", seconds: "0", numberingStyle: style, genres: "Drama", moods: ["funny"], watchUrl: "" } }, origin); if (result.kind !== "created") throw new Error(); return result.id; }
beforeEach(() => {
  db = new DatabaseSync(":memory:"); migrate(db); const invite = createGroup(db, "Group", origin).inviteUrl.split("/").at(-1)!;
  anna = acceptInvitation(db, invite); max = acceptInvitation(db, invite); viewer = acceptInvitation(db, invite); other = acceptInvitation(db, createGroup(db, "Other", origin).inviteUrl.split("/").at(-1)!);
  for (const [cookie, name, color] of [[anna, "Anna", "#1d4ed8"], [max, "Max", "#0f766e"], [other, "Other", "#6d28d9"]]) changeProfile(db, req(cookie), { intent: "create", name, color }, origin);
  movie = saved("Movie", "movie", "none"); series = saved("Series", "series", "season_episode"); otherTitle = saved("Other", "movie", "none", other);
});
afterEach(() => db.close());
it.each([["1", 1], ["10", 10], ["5", 5], [" 8 ", 8]] as const)("accepts canonical whole-number text %s", (text, score) => expect(parseRating(text)).toBe(score));
it.each(["", " ", "0", "-1", "+1", "11", "7.5", "8.0", "1e1", "08", "one", "8x", "1 0", 8, null, undefined, {}, ["8"]])("rejects malformed/nontext score %s without changing an existing rating", score => {
  write(); const before = all(); expect(() => write({ score })).toThrow(RatingFieldError); expect(all()).toBe(before);
});
it("saves/changes 1, 10 and a middle whole-title score before completion or contribution, without inventing progress", () => {
  const before = all(); expect(readOwnRating(db, req(max), series).score).toBeNull(); expect(all()).toBe(before);
  for (const score of ["1", "10", "5"]) expect(write({ score }, series, max).score).toBe(Number(score));
  expect(readOwnRating(db, req(max), series).score).toBe(5); expect(db.prepare("SELECT * FROM progress").all()).toEqual([]); expect(readTitleDetails(db, req(), series).contributors.map(member => member.name)).toEqual(["Anna"]);
});
it("keeps independent named/color-attributed scores visible to group viewers without profile selection", () => {
  write(); write({ score: "3" }, movie, max); write({ score: "10" });
  const detail = readTitleDetails(db, req(viewer), movie); expect(detail.activeMemberId).toBeNull();
  expect(detail.history).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Anna", color: "#1d4ed8", rating: 10 }), expect.objectContaining({ name: "Max", color: "#0f766e", rating: 3 })]));
  expect(detail.history.some(member => member.name === "Other")).toBe(false);
  expect(readOwnRating(db, req(max), movie).score).toBe(3); expect(() => write({}, movie, viewer)).toThrow();
});
it("same-value saves and absent clears are no-ops; clear removes only the own row, never inserting zero", () => {
  write(); write({ score: "3" }, movie, max);
  db.exec("CREATE TRIGGER forbid_rating_update BEFORE UPDATE ON ratings BEGIN SELECT RAISE(ABORT,'No unnecessary rewrite'); END");
  const before = all(); expect(write().score).toBe(8); expect(all()).toBe(before); db.exec("DROP TRIGGER forbid_rating_update");
  expect(write({ intent: "clear_rating", score: "invalid unsaved value" }).score).toBeNull(); expect(readOwnRating(db, req(max), movie).score).toBe(3);
  const cleared = all(); expect(write({ intent: "clear_rating" }).score).toBeNull(); expect(all()).toBe(cleared); expect(db.prepare("SELECT count(*) n FROM ratings WHERE score=0").get()?.n).toBe(0);
});
it("changes only ratings, preserving both progress styles/completion, notes, provenance and shared eligibility inputs", () => {
  const context = requireSession(db, anna), maxId = requireSession(db, max).activeMemberId!;
  db.prepare("INSERT INTO progress(group_id,title_id,member_id,numbering_style,timestamp_seconds,completed) VALUES (?,?,?,'none',4200,1)").run(context.groupId, movie, context.activeMemberId!);
  db.prepare("INSERT INTO progress(group_id,title_id,member_id,numbering_style,position_state,next_season,next_episode) VALUES (?,?,?,'season_episode','in_progress',2,7)").run(context.groupId, series, maxId);
  db.prepare("INSERT INTO notes(group_id,title_id,member_id,body) VALUES (?,?,?,'Independent note')").run(context.groupId, movie, maxId);
  db.prepare("INSERT INTO metadata_fields(title_id,field,origin) VALUES (?,'title','user')").run(movie);
  const preserved = () => JSON.stringify(["titles", "contributors", "progress", "notes", "title_moods", "title_genres", "metadata_fields"].map(table => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()));
  const before = preserved(); write(); write({ score: "3" }, movie, max); write({ intent: "clear_rating" }); expect(preserved()).toBe(before);
});
it("genuinely expired metadata stays unavailable and does not gate or delete ratings", () => {
  write(); db.prepare("UPDATE titles SET provider_namespace='youtube',provider_id='YtFixture01' WHERE id=?").run(movie);
  for (const field of ["title", "contentType", "duration"]) db.prepare("INSERT INTO metadata_fields(title_id,field,origin,retrieved_at,expires_at) VALUES (?,?,'provider','2000-01-01','2000-01-02')").run(movie, field);
  expect(readTitleDetails(db, req(), movie)).toMatchObject({ title: null, contentType: null, durationSeconds: null });
  const expired = db.prepare("SELECT * FROM metadata_fields").all(); expect(write({ score: "9" }).score).toBe(9); expect(db.prepare("SELECT * FROM metadata_fields").all()).toEqual(expired); expect(db.prepare("SELECT title,content_type,duration_seconds FROM titles WHERE id=?").get(movie)).toMatchObject({ title: null, content_type: null, duration_seconds: null });
});
it("archive/restore retains both ratings/history; archive-at-submit denies save and clear without automatic restore", () => {
  write(); write({ score: "3" }, movie, max); const context = requireSession(db, anna);
  db.prepare("INSERT INTO notes(group_id,title_id,member_id,body) VALUES (?,?,?,'Preserved')").run(context.groupId, movie, context.activeMemberId!);
  const prior = JSON.stringify(db.prepare("SELECT * FROM ratings ORDER BY member_id").all()); removeOwnContribution(db, req(), movie, {}, origin);
  const archived = all(); for (const intent of ["save_rating", "clear_rating"]) expect(() => write({ intent })).toThrow(); expect(all()).toBe(archived);
  expect(readOwnRating(db, req(), movie).score).toBe(8); expect(readTitleDetails(db, req(viewer), movie).history.find(member => member.name === "Max")?.rating).toBe(3);
  restoreTitle(db, req(max), movie, {}, origin); expect(JSON.stringify(db.prepare("SELECT * FROM ratings ORDER BY member_id").all())).toBe(prior); expect(db.prepare("SELECT body FROM notes").get()?.body).toBe("Preserved"); expect(write({ score: "9" }).score).toBe(9);
});
it("denies forged member/group claims, missing member, cross-group target and unsupported authority fields", () => {
  for (const [extra, id] of [[{ memberId: requireSession(db, max).activeMemberId }, movie], [{ groupId: requireSession(db, other).groupId }, movie], [{ memberId: undefined }, movie], [{}, otherTitle], [{ completed: true }, movie], [{ contributor: true }, movie]] as const) { const before = all(); expect(() => write(extra, id)).toThrow(); expect(all()).toBe(before); }
});
it("rechecks profile switching, missing/revoked sessions and wrong/missing origins with no rating/history changes", () => {
  const displayed = input(); changeProfile(db, req(), { intent: "select", memberId: requireSession(db, max).activeMemberId! }, origin);
  let before = all(); expect(() => updateOwnRating(db, req(), movie, displayed, origin)).toThrow(); expect(all()).toBe(before);
  for (const request of [req(max, "https://evil.example"), new Request(origin, { method: "POST", headers: { cookie: `${sessionCookieName}=${max}` } }), new Request(origin, { method: "POST", headers: { origin } })]) { before = all(); expect(() => updateOwnRating(db, request, movie, input({}, max), origin)).toThrow(); expect(all()).toBe(before); }
  db.exec("UPDATE invitations SET revoked_at=CURRENT_TIMESTAMP"); before = all(); expect(() => updateOwnRating(db, req(max), movie, displayed, origin)).toThrow(); expect(all()).toBe(before);
});
it("insert/update/delete failures roll back and a retry uses the original own row", () => {
  for (const phase of ["INSERT", "UPDATE", "DELETE"]) {
    if (phase !== "INSERT") write();
    const before = all(); db.exec(`CREATE TRIGGER fail_rating BEFORE ${phase} ON ratings BEGIN SELECT RAISE(ABORT,'synthetic private failure'); END`);
    expect(() => write(phase === "DELETE" ? { intent: "clear_rating" } : { score: "9" })).toThrow(); expect(all()).toBe(before); db.exec("DROP TRIGGER fail_rating");
  }
  expect(write({ score: "9" }).score).toBe(9);
});
