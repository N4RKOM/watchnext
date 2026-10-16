// @vitest-environment node
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, expect, it } from "vitest";
import { migrate } from "../db/migrate";
import { createGroup } from "../lib/groups";
import { acceptInvitation, requireSession, sessionCookieName } from "../lib/sessions";
import { changeProfile } from "../lib/profiles";
import { saveTitle } from "../lib/shared-save";
import { readTitleDetails } from "../lib/title-details";
import { readWatchlist } from "../lib/watchlist";
import { parseWatchTimestamp, TimestampFieldError, readOwnWatchProgress, updateWatchProgress } from "../lib/watch-progress";
import { formatWatchTimestamp } from "../lib/watch-progress-state";
let db: DatabaseSync, anna: string, max: string, other: string, movie: string, video: string, series: string, otherTitle: string;
const origin = "https://watch.example";
const req = (cookie = anna, source = origin) => new Request(origin, { method: "POST", headers: { origin: source, cookie: `${sessionCookieName}=${cookie}` } });
const input = (extra: Record<string, unknown> = {}, cookie = anna) => ({ intent: "save_timestamp", memberId: requireSession(db, cookie).activeMemberId!, numberingStyle: "none", timestamp: "1:10:00", ...extra });
const write = (extra: Record<string, unknown> = {}, id = movie, cookie = anna) => updateWatchProgress(db, req(cookie), id, input(extra, cookie), origin);
const all = () => JSON.stringify(["titles", "contributors", "progress", "ratings", "notes", "title_moods", "title_genres", "metadata_fields"].map(table => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()));
function saved(title: string, type: string, style: string, cookie = anna) { const result = saveTitle(db, req(cookie), { kind: "manual", fields: { title, contentType: type, minutes: "90", seconds: "0", numberingStyle: style, genres: "Drama", moods: ["funny"], watchUrl: "" } }, origin); if (result.kind !== "created") throw new Error(); return result.id; }
beforeEach(() => {
  db = new DatabaseSync(":memory:"); migrate(db); const invite = createGroup(db, "Group", origin).inviteUrl.split("/").at(-1)!;
  anna = acceptInvitation(db, invite); max = acceptInvitation(db, invite); other = acceptInvitation(db, createGroup(db, "Other", origin).inviteUrl.split("/").at(-1)!);
  for (const [cookie, name] of [[anna, "Anna"], [max, "Max"], [other, "Other"]]) changeProfile(db, req(cookie), { intent: "create", name, color: "#1d4ed8" }, origin);
  movie = saved("Movie", "movie", "none"); video = saved("Video", "youtube", "none"); series = saved("Series", "series", "season_episode"); otherTitle = saved("Other movie", "movie", "none", other);
});
afterEach(() => db.close());
it.each([["0:00", 0], ["1:00", 60], ["70:00", 4200], [" 1:10:00 ", 4200], ["0:59:59", 3599], ["1:00:00", 3600], ["1:30:00", 5400], ["24:00:00", 86400], ["", null], [" \t ", null]] as const)("parses whole-second %s without rounding", (text, seconds) => expect(parseWatchTimestamp(text)).toBe(seconds));
it.each(["1:0", "1:000", "1:60", "1:1:01", "1:60:00", "-1:00", "+1:00", "1.5:00", "1e2:00", "1 :00", "1: 00", "1:00junk", "1:00\njunk", "99999999999999999999999:00", 0, null, undefined, {}])("rejects invalid/nontext format %s", value => expect(() => parseWatchTimestamp(value)).toThrow(TimestampFieldError));
it.each([[null, ""], [0, "0:00"], [59, "0:59"], [60, "1:00"], [3599, "59:59"], [3600, "1:00:00"], [4200, "1:10:00"], [86400, "24:00:00"]] as const)("formats %s canonically", (seconds, text) => expect(formatWatchTimestamp(seconds)).toBe(text));
it("does not fabricate a row on read/clear; zero and exact full duration persist without inferred completion", () => {
  const before = all(); expect(readOwnWatchProgress(db, req(), movie)).toMatchObject({ recorded: false, timestampSeconds: null, completed: false, fullDurationSeconds: 5400 }); expect(all()).toBe(before);
  expect(write({ intent: "clear_timestamp" }).recorded).toBe(false); expect(db.prepare("SELECT * FROM progress").all()).toEqual([]);
  expect(write({ timestamp: "0:00" })).toMatchObject({ recorded: true, timestampSeconds: 0, completed: false });
  expect(write({ timestamp: "1:30:00" })).toMatchObject({ timestampSeconds: 5400, completed: false });
  const unchanged = all(); expect(() => write({ timestamp: "1:30:01" })).toThrow(TimestampFieldError); expect(all()).toBe(unchanged);
  expect(write({ timestamp: "" })).toMatchObject({ timestampSeconds: null, completed: false });
});
it("keeps Anna/Max independent without contribution and preserves full duration for future picker consumers", () => {
  write(); write({ timestamp: "12:05", intent: "save_timestamp" }, movie, max); write({ intent: "complete" }, movie, max);
  expect(readOwnWatchProgress(db, req(), movie)).toMatchObject({ timestampSeconds: 4200, completed: false, fullDurationSeconds: 5400 });
  expect(readOwnWatchProgress(db, req(max), movie)).toMatchObject({ timestampSeconds: 725, completed: true });
  write({ timestamp: "1:00" }); expect(readOwnWatchProgress(db, req(), movie).timestampSeconds).toBe(60);
  expect(readTitleDetails(db, req(), movie).contributors.map(member => member.name)).toEqual(["Anna"]);
  expect(readWatchlist(db, req()).items.find(item => item.id === movie)?.durationSeconds).toBe(5400);
  expect(readTitleDetails(db, req(), movie).durationSeconds).toBe(5400);
});
it("completion creates no timestamp when absent and complete/undo ignore unsaved invalid form text", () => {
  expect(write({ intent: "complete", timestamp: "invalid" })).toMatchObject({ timestampSeconds: null, completed: true });
  write(); expect(readOwnWatchProgress(db, req(), movie).completed).toBe(true);
  expect(write({ intent: "undo_completion", timestamp: "0:00" })).toMatchObject({ timestampSeconds: 4200, completed: false });
  write({ intent: "complete" }); expect(write({ intent: "clear_timestamp" })).toMatchObject({ timestampSeconds: null, completed: true });
});
it("preserves oversized legacy timestamps on completion-only SQL after duration correction, while new values use current bounds", () => {
  write(); write({ intent: "complete" }); db.prepare("UPDATE titles SET duration_seconds=3600 WHERE id=?").run(movie);
  expect(readOwnWatchProgress(db, req(), movie)).toMatchObject({ timestampSeconds: 4200, completed: true, beyondDuration: true, fullDurationSeconds: 3600 });
  expect(write({ intent: "undo_completion", timestamp: "junk" })).toMatchObject({ timestampSeconds: 4200, completed: false });
  expect(write({ intent: "complete" })).toMatchObject({ timestampSeconds: 4200, completed: true });
  const before = all(); expect(() => write()).toThrow("must not exceed"); expect(all()).toBe(before);
  expect(write({ timestamp: "1:00:00" })).toMatchObject({ timestampSeconds: 3600, completed: true, beyondDuration: false });
  expect(write({ intent: "clear_timestamp" })).toMatchObject({ timestampSeconds: null, completed: true });
});
it("preserves metadata/provenance, attribution, ratings/notes, other-member and episodic histories", () => {
  const context = requireSession(db, anna), maxId = requireSession(db, max).activeMemberId!;
  write({ timestamp: "12:05" }, movie, max);
  db.prepare("INSERT INTO progress(group_id,title_id,member_id,numbering_style,position_state,next_season,next_episode) VALUES (?,?,?,'season_episode','in_progress',2,5)").run(context.groupId, series, context.activeMemberId!);
  db.prepare("INSERT INTO ratings(group_id,title_id,member_id,score) VALUES (?,?,?,8)").run(context.groupId, movie, maxId);
  db.prepare("INSERT INTO notes(group_id,title_id,member_id,body) VALUES (?,?,?,'Independent note')").run(context.groupId, movie, maxId);
  db.prepare("INSERT INTO metadata_fields(title_id,field,origin) VALUES (?,'title','user')").run(movie);
  const rows = () => JSON.stringify(["titles", "contributors", "ratings", "notes", "title_moods", "title_genres", "metadata_fields"].map(table => db.prepare(`SELECT * FROM ${table}`).all()));
  const before = rows(), otherProgress = db.prepare("SELECT * FROM progress ORDER BY title_id,member_id").all(); write(); write({ intent: "complete" }); write({ intent: "clear_timestamp" });
  expect(rows()).toBe(before); expect(db.prepare("SELECT * FROM progress WHERE member_id<>? OR title_id<>? ORDER BY title_id,member_id").all(context.activeMemberId!, movie)).toEqual(otherProgress);
});
it("expired runtime/type keeps history readable and permits clear/completion but rejects all nonblank new timestamps", () => {
  write(); db.prepare("UPDATE titles SET provider_namespace='youtube',provider_id='YtFixture01' WHERE id=?").run(movie);
  for (const field of ["title", "contentType", "duration"]) db.prepare("INSERT INTO metadata_fields(title_id,field,origin,retrieved_at,expires_at) VALUES (?,?,'provider','2000-01-01','2000-01-02')").run(movie, field);
  expect(readOwnWatchProgress(db, req(), movie)).toMatchObject({ timestampSeconds: 4200, runtimeAvailable: false, fullDurationSeconds: null });
  expect(db.prepare("SELECT title,content_type,duration_seconds,numbering_style FROM titles WHERE id=?").get(movie)).toMatchObject({ title: null, content_type: null, duration_seconds: null, numbering_style: "none" });
  expect(write({ intent: "complete", timestamp: "junk" })).toMatchObject({ timestampSeconds: 4200, completed: true });
  const before = all(); for (const timestamp of ["0:00", "1:00", "1:10:00"]) expect(() => write({ timestamp })).toThrow("duration is unavailable"); expect(all()).toBe(before);
  expect(write({ intent: "undo_completion" })).toMatchObject({ timestampSeconds: 4200, completed: false }); expect(write({ intent: "clear_timestamp" }).timestampSeconds).toBeNull();
});
it("denies forged member/group, missing profile claim, cross-group target and episodic structure without changes", () => {
  for (const [extra, id] of [[{ memberId: requireSession(db, max).activeMemberId }, movie], [{ groupId: requireSession(db, other).groupId }, movie], [{ memberId: undefined }, movie], [{ numberingStyle: "continuous" }, movie], [{}, otherTitle], [{}, series]] as const) { const before = all(); expect(() => write(extra, id)).toThrow(); expect(all()).toBe(before); }
});
it("rechecks switched/missing/revoked session, request origin and archive-at-submit inside the transaction", () => {
  const displayed = input(); changeProfile(db, req(), { intent: "select", memberId: requireSession(db, max).activeMemberId! }, origin);
  let before = all(); expect(() => updateWatchProgress(db, req(), movie, displayed, origin)).toThrow(); expect(all()).toBe(before);
  for (const request of [req(max, "https://evil.example"), new Request(origin, { method: "POST", headers: { cookie: `${sessionCookieName}=${max}` } }), new Request(origin, { method: "POST", headers: { origin } })]) { before = all(); expect(() => updateWatchProgress(db, request, movie, input({}, max), origin)).toThrow(); expect(all()).toBe(before); }
  db.prepare("UPDATE titles SET archived=1 WHERE id=?").run(movie); before = all(); expect(() => write({}, movie, max)).toThrow(); expect(all()).toBe(before); expect(readOwnWatchProgress(db, req(max), movie).recorded).toBe(false);
  db.exec("UPDATE invitations SET revoked_at=CURRENT_TIMESTAMP"); before = all(); expect(() => updateWatchProgress(db, req(max), video, displayed, origin)).toThrow(); expect(all()).toBe(before);
});
it("rejects changed structure and incompatible episode fields instead of converting progress", () => {
  const before = all(); expect(() => write({ nextEpisode: "3" })).toThrow(TimestampFieldError); expect(all()).toBe(before);
  db.prepare("UPDATE titles SET content_type='series',numbering_style='season_episode' WHERE id=?").run(video);
  const changed = all(); expect(() => write({}, video)).toThrow(); expect(all()).toBe(changed);
});
it("rolls back timestamp/clear/completion storage failure while retaining all prior state", () => {
  write(); const before = all(); db.exec("CREATE TRIGGER fail_watch BEFORE UPDATE ON progress BEGIN SELECT RAISE(ABORT,'synthetic private failure'); END");
  for (const extra of [{ timestamp: "12:00" }, { intent: "clear_timestamp" }, { intent: "complete" }]) { expect(() => write(extra)).toThrow(); expect(all()).toBe(before); }
});
