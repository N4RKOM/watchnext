// @vitest-environment node
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, expect, it } from "vitest";
import { migrate } from "../db/migrate";
import { createGroup } from "../lib/groups";
import { acceptInvitation, requireSession, sessionCookieName } from "../lib/sessions";
import { changeProfile } from "../lib/profiles";
import { saveTitle } from "../lib/shared-save";
import { readTitleDetails } from "../lib/title-details";
import { EpisodeFieldError, readOwnEpisodeProgress, updateEpisodeProgress } from "../lib/episode-progress";
let db: DatabaseSync, anna: string, max: string, other: string, seasonId: string, continuousId: string, movieId: string, otherTitle: string;
const origin = "https://watch.example";
const req = (cookie = anna, source = origin) => new Request(origin, { method: "POST", headers: { origin: source, cookie: `${sessionCookieName}=${cookie}` } });
const input = (cookie = anna, style = "season_episode", extra: Record<string, unknown> = {}) => ({ intent: "save_position", memberId: requireSession(db, cookie).activeMemberId!, numberingStyle: style, positionState: "in_progress", nextSeason: "1", nextEpisode: "3", ...extra });
const write = (extra: Record<string, unknown> = {}, id = seasonId, cookie = anna) => updateEpisodeProgress(db, req(cookie), id, input(cookie, id === continuousId ? "continuous" : "season_episode", { ...(id === continuousId ? { nextSeason: "" } : {}), ...extra }), origin);
const all = () => JSON.stringify(["titles", "contributors", "progress", "ratings", "notes", "title_moods", "title_genres"].map(table => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()));
function saved(title: string, contentType: string, numberingStyle: string, cookie = anna) {
  const result = saveTitle(db, req(cookie), { kind: "manual", fields: { title, contentType, minutes: "24", seconds: "0", numberingStyle, genres: "Drama", moods: ["funny"], watchUrl: "" } }, origin);
  if (result.kind !== "created") throw new Error(); return result.id;
}
beforeEach(() => {
  db = new DatabaseSync(":memory:"); migrate(db);
  const invite = createGroup(db, "Group", origin).inviteUrl.split("/").at(-1)!;
  anna = acceptInvitation(db, invite); max = acceptInvitation(db, invite); other = acceptInvitation(db, createGroup(db, "Other", origin).inviteUrl.split("/").at(-1)!);
  for (const [cookie, name] of [[anna, "Anna"], [max, "Max"], [other, "Other"]]) changeProfile(db, req(cookie), { intent: "create", name, color: "#1d4ed8" }, origin);
  seasonId = saved("Series", "series", "season_episode"); continuousId = saved("Anime", "anime", "continuous"); movieId = saved("Movie", "movie", "none"); otherTitle = saved("Other title", "series", "season_episode", other);
});
afterEach(() => db.close());
it("projects an absent row as Unknown / unrecorded without writing fabricated coordinates", () => {
  const before = all(); expect(readOwnEpisodeProgress(db, req(), seasonId)).toMatchObject({ recorded: false, positionState: "unknown", nextSeason: null, nextEpisode: null, completed: false }); expect(all()).toBe(before);
});
it.each(["season_episode", "continuous"])("persists explicit Unknown, Not started and In progress for %s", style => {
  const id = style === "continuous" ? continuousId : seasonId;
  expect(write({ positionState: "unknown", nextSeason: "", nextEpisode: "" }, id)).toMatchObject({ recorded: true, positionState: "unknown", nextSeason: null, nextEpisode: null });
  expect(write({ positionState: "not_started", nextSeason: "", nextEpisode: "" }, id)).toMatchObject({ positionState: "not_started", nextSeason: style === "continuous" ? null : 1, nextEpisode: 1 });
  expect(write({ nextEpisode: "9999", ...(style === "season_episode" ? { nextSeason: "9999" } : {}) }, id).nextEpisode).toBe(9999);
  expect(readOwnEpisodeProgress(db, req(), id)).toMatchObject({ positionState: "in_progress", nextEpisode: 9999 });
});
it.each(["0", "-1", "2.5", "1e2", "10000", "", "NaN", null, undefined, 3, {}, new Uint8Array([3])])("rejects invalid/nontext episode %s with a field error and no partial change", value => {
  write(); const before = all();
  expect(() => write({ nextEpisode: value })).toThrow(EpisodeFieldError);
  try { write({ nextEpisode: value }); } catch (error) { expect(error).toMatchObject({ field: "nextEpisode" }); }
  expect(all()).toBe(before);
});
it("rejects missing season, continuous season, incompatible state coordinates, timestamps and unknown states", () => {
  for (const [extra, id, field] of [[{ nextSeason: "" }, seasonId, "nextSeason"], [{ nextSeason: "2" }, continuousId, "nextSeason"], [{ positionState: "unknown" }, seasonId, "nextSeason"], [{ positionState: "not_started", nextSeason: "", nextEpisode: "8" }, continuousId, "nextEpisode"], [{ timestampSeconds: "20" }, seasonId, "positionState"], [{ positionState: "finished" }, seasonId, "positionState"]] as const) {
    const before = all(); try { write(extra, id); throw new Error("Expected rejection"); } catch (error) { expect(error).toMatchObject({ field }); } expect(all()).toBe(before);
  }
});
it("keeps two members independent without requiring contribution and supports backward corrections/manual season transitions", () => {
  write(); write({ nextEpisode: "7" }, seasonId, max); write({ nextEpisode: "2" });
  expect(readOwnEpisodeProgress(db, req(), seasonId).nextEpisode).toBe(2); expect(readOwnEpisodeProgress(db, req(max), seasonId).nextEpisode).toBe(7);
  write({ nextSeason: "1", nextEpisode: "12" }); write({ nextSeason: "2", nextEpisode: "1" });
  expect(readOwnEpisodeProgress(db, req(), seasonId)).toMatchObject({ nextSeason: 2, nextEpisode: 1 });
  const detail = readTitleDetails(db, req(), seasonId); expect(detail.history).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Anna", nextSeason: 2, nextEpisode: 1 }), expect.objectContaining({ name: "Max", nextEpisode: 7 })]));
  expect(detail.contributors.map(member => member.name)).toEqual(["Anna"]);
});
it("completion creates Unknown only when absent, retains stored coordinates and ignores unsaved position inputs", () => {
  expect(write({ intent: "complete", nextSeason: "999", nextEpisode: "junk" })).toMatchObject({ positionState: "unknown", nextSeason: null, nextEpisode: null, completed: true });
  write(); expect(readOwnEpisodeProgress(db, req(), seasonId).completed).toBe(true);
  expect(write({ intent: "undo_completion", nextEpisode: "8" })).toMatchObject({ completed: false, nextSeason: 1, nextEpisode: 3 });
  write({ intent: "complete" }); write({ positionState: "unknown", nextSeason: "", nextEpisode: "" });
  expect(readOwnEpisodeProgress(db, req(), seasonId)).toMatchObject({ completed: true, positionState: "unknown", nextEpisode: null });
  write({ positionState: "not_started", nextSeason: "", nextEpisode: "" }); expect(readOwnEpisodeProgress(db, req(), seasonId).completed).toBe(true);
});
it("updates only the selected own row and preserves other history, shared metadata and attribution", () => {
  write({ nextEpisode: "7" }, seasonId, max);
  const context = requireSession(db, anna);
  for (const memberId of [context.activeMemberId!, requireSession(db, max).activeMemberId!]) {
    db.prepare("INSERT INTO ratings(group_id,title_id,member_id,score) VALUES (?,?,?,8)").run(context.groupId, seasonId, memberId);
    db.prepare("INSERT INTO notes(group_id,title_id,member_id,body) VALUES (?,?,?,'Independent note')").run(context.groupId, seasonId, memberId);
  }
  const before = JSON.stringify(["titles", "contributors", "ratings", "notes", "title_moods", "title_genres"].map(table => db.prepare(`SELECT * FROM ${table}`).all())), maxBefore = readOwnEpisodeProgress(db, req(max), seasonId);
  write(); write({ intent: "complete" }); write({ intent: "undo_completion" });
  expect(readOwnEpisodeProgress(db, req(max), seasonId)).toEqual(maxBefore);
  expect(JSON.stringify(["titles", "contributors", "ratings", "notes", "title_moods", "title_genres"].map(table => db.prepare(`SELECT * FROM ${table}`).all()))).toBe(before);
});
it("denies forged member/group claims, missing member, cross-group targets and movie/video structure", () => {
  for (const [extra, id] of [[{ memberId: requireSession(db, max).activeMemberId }, seasonId], [{ groupId: requireSession(db, other).groupId }, seasonId], [{ memberId: undefined }, seasonId], [{ numberingStyle: "continuous" }, seasonId], [{}, otherTitle], [{}, movieId]] as const) {
    const before = all(); expect(() => write(extra, id)).toThrow(); expect(all()).toBe(before);
  }
});
it("denies switched/revoked/missing sessions, wrong origin, and archive-at-submit without restoring", () => {
  const stale = input(); changeProfile(db, req(), { intent: "select", memberId: requireSession(db, max).activeMemberId! }, origin);
  let before = all(); expect(() => updateEpisodeProgress(db, req(), seasonId, stale, origin)).toThrow(); expect(all()).toBe(before);
  for (const request of [req(max, "https://evil.example"), new Request(origin, { method: "POST", headers: { origin } })]) { before = all(); expect(() => updateEpisodeProgress(db, request, seasonId, input(max), origin)).toThrow(); expect(all()).toBe(before); }
  db.prepare("UPDATE titles SET archived=1 WHERE id=?").run(seasonId); before = all(); expect(() => write({}, seasonId, max)).toThrow(); expect(all()).toBe(before);
  expect(readOwnEpisodeProgress(db, req(max), seasonId).recorded).toBe(false);
  db.exec("DELETE FROM group_sessions"); before = all(); expect(() => updateEpisodeProgress(db, req(max), seasonId, stale, origin)).toThrow(); expect(all()).toBe(before);
});
it("retained episodic structure remains writable after actual provider metadata expiry without reconstructing fields", () => {
  write(); const context = requireSession(db, anna);
  db.prepare("UPDATE titles SET provider_namespace='kinopoisk_unofficial',provider_id='1001' WHERE id=?").run(seasonId);
  for (const field of ["title", "contentType", "duration"]) db.prepare("INSERT INTO metadata_fields(title_id,field,origin,retrieved_at,expires_at) VALUES (?,?,'provider','2000-01-01','2000-01-02')").run(seasonId, field);
  db.prepare("INSERT INTO notes(group_id,title_id,member_id,body) VALUES (?,?,?,'Preserved')").run(context.groupId, seasonId, context.activeMemberId!);
  expect(write({ nextEpisode: "4" })).toMatchObject({ nextSeason: 1, nextEpisode: 4 });
  expect(db.prepare("SELECT title,title_key,content_type,duration_seconds,numbering_style FROM titles WHERE id=?").get(seasonId)).toMatchObject({ title: null, title_key: null, content_type: null, duration_seconds: null, numbering_style: "season_episode" });
  expect(db.prepare("SELECT body FROM notes").get()?.body).toBe("Preserved");
});
it("storage failure rolls back the existing own row and the whole prior history", () => {
  write(); const before = all(); db.exec("CREATE TRIGGER fail_episode BEFORE UPDATE ON progress BEGIN SELECT RAISE(ABORT,'synthetic private storage failure'); END");
  expect(() => write({ nextEpisode: "8" })).toThrow(); expect(all()).toBe(before);
  expect(() => write({ intent: "complete" })).toThrow(); expect(all()).toBe(before);
});
