// @vitest-environment node
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, expect, it } from "vitest";
import { migrate } from "../../db/migrate";
import { createGroup } from "../../lib/groups";
import { acceptInvitation, requireSession, sessionCookieName } from "../../lib/sessions";
import { changeProfile } from "../../lib/profiles";
import { saveTitle } from "../../lib/shared-save";
import { editTitle, readEditableTitle } from "../../lib/edit-title";
import { readTitleDetails } from "../../lib/title-details";
import { fixedMoods } from "../../lib/title-state";
import { updateEpisodeProgress } from "../../lib/episode-progress";
import { updateWatchProgress } from "../../lib/watch-progress";
import { updateOwnRating } from "../../lib/ratings";
import { updateOwnNote } from "../../lib/notes";
import { removeOwnContribution, restoreTitle } from "../../lib/contributions";
import { rankCandidates } from "../../lib/picker/ranking";
import type { RankingInput } from "../../lib/picker/ranking";

let db: DatabaseSync, anna: string, max: string;
const origin = "https://watch.example";
const req = (cookie = anna) => new Request(origin, { method: "POST", headers: { origin, cookie: `${sessionCookieName}=${cookie}` } });
const member = (cookie: string) => requireSession(db, cookie).activeMemberId!;
const fields = (title: string, type = "movie", minutes = "25") => ({ title, contentType: type, minutes, seconds: "0", numberingStyle: type === "series" ? "season_episode" : type === "anime" ? "continuous" : "none", genres: "", moods: ["funny"], watchUrl: "" });
function save(title: string, type = "movie", minutes = "25") {
  const result = saveTitle(db, req(), { kind: "manual", fields: fields(title, type, minutes) }, origin);
  if (result.kind !== "created") throw new Error(); return result.id;
}
const histories = () => JSON.stringify(["progress", "ratings", "notes"].map(table => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()));
/** Test-only fresh authorized saved projection; no new runtime database path. */
function input(ids: string[], extra: Partial<RankingInput> = {}): RankingInput {
  const session = requireSession(db, anna), details = ids.map(id => readTitleDetails(db, req(), id));
  return { groupId: session.groupId, selectedViewerIds: [member(anna), member(max)], availableMinutes: "25", mood: "funny",
    members: details[0].history.map(row => ({ id: row.id, groupId: session.groupId })),
    titles: details.map(detail => ({ id: detail.id, groupId: session.groupId, title: detail.title, contentType: detail.contentType,
      durationSeconds: detail.durationSeconds, archived: detail.archived, numberingStyle: detail.numberingStyle,
      moods: detail.moods.map(label => fixedMoods.find(mood => mood.label === label)!.value),
      createdAt: db.prepare("SELECT created_at FROM titles WHERE id=? AND group_id=?").get(detail.id, session.groupId)!.created_at as string })),
    progress: details.flatMap(detail => detail.history.filter(row => row.completed !== null).map(row => ({ titleId: detail.id, groupId: session.groupId,
      memberId: row.id, numberingStyle: detail.numberingStyle, completed: row.completed!, positionState: row.positionState!, nextSeason: row.nextSeason, nextEpisode: row.nextEpisode }))), ...extra };
}
const ids = (snapshot: RankingInput) => { const result = rankCandidates(snapshot); if (result.kind !== "ranked") throw new Error(); return result.candidates.map(candidate => candidate.titleId); };
beforeEach(() => {
  db = new DatabaseSync(":memory:"); migrate(db); const invite = createGroup(db, "Group", origin).inviteUrl.split("/").at(-1)!;
  anna = acceptInvitation(db, invite); max = acceptInvitation(db, invite);
  for (const [cookie, name] of [[anna, "Anna"], [max, "Max"]]) changeProfile(db, req(cookie), { intent: "create", name, color: "#1d4ed8" }, origin);
});
afterEach(() => db.close());
it("actual original creation ties survive adding contributors, metadata edits and archive/restore", () => {
  const older = save("Older"), newer = save("Newer");
  db.prepare("UPDATE titles SET created_at='2025-01-01T00:00:00.000Z' WHERE id=?").run(older);
  db.prepare("UPDATE titles SET created_at='2026-01-01T00:00:00.000Z' WHERE id=?").run(newer);
  const original = input([newer, older]).titles.map(title => title.createdAt);
  expect(ids(input([newer, older]))).toEqual([older, newer]);
  expect(saveTitle(db, req(max), { kind: "manual", fields: fields("Older"), confirmationId: older }, origin).kind).toBe("existing");
  const editable = readEditableTitle(db, req(), older);
  expect(editTitle(db, req(), older, { fields: { ...editable.values, moods: editable.moods, genres: "Comedy" }, revision: editable.revision, sourceUrl: editable.values.sourceUrl, coverUrl: editable.values.coverUrl }, origin).kind).toBe("saved");
  removeOwnContribution(db, req(), older, {}, origin); removeOwnContribution(db, req(max), older, {}, origin);
  expect(ids(input([newer, older]))).toEqual([newer]);
  restoreTitle(db, req(), older, {}, origin);
  expect(input([newer, older]).titles.map(title => title.createdAt)).toEqual(original); expect(ids(input([newer, older]))).toEqual([older, newer]);
});
it("real series/anime typical runtime and exact rewatch targets rank without changing history; feedback has no effect", () => {
  const series = save("Series", "series", "24"), anime = save("Anime", "anime", "18");
  for (const id of [series, anime]) for (const [cookie, nextEpisode] of [[anna, "3"], [max, "7"]]) updateEpisodeProgress(db, req(cookie), id, {
    intent: "save_position", memberId: member(cookie), numberingStyle: id === series ? "season_episode" : "continuous", positionState: "in_progress", nextSeason: id === series ? "1" : "", nextEpisode,
  }, origin);
  const snapshot = input([anime, series], { rewatches: true }), before = histories(), ranked = rankCandidates(snapshot);
  expect(ranked).toMatchObject({ kind: "ranked", tier: "exact", candidates: [
    { titleId: series, durationSeconds: 1440, target: { numberingStyle: "season_episode", nextSeason: 1, nextEpisode: 3, catchUp: true }, rewatchingViewerIds: [member(max)] },
    { titleId: anime, durationSeconds: 1080, target: { numberingStyle: "continuous", nextSeason: null, nextEpisode: 3 } },
  ] }); expect(histories()).toBe(before);
  updateOwnRating(db, req(), series, { intent: "save_rating", memberId: member(anna), score: "1" }, origin);
  updateOwnNote(db, req(max), anime, { intent: "save_note", memberId: member(max), body: "Never an eligibility/ranking input" }, origin);
  expect(rankCandidates(input([anime, series], { rewatches: true }))).toEqual(ranked);
  expect(rankCandidates(input([anime, series]))).toMatchObject({ kind: "no_match", reasons: ["viewer_ineligible"] });
});
it("real movie/video timestamps never shorten full runtime and expired provider metadata cannot return as fallback", () => {
  const movie = save("Movie", "movie", "90"), video = save("Video", "youtube", "24");
  updateWatchProgress(db, req(), movie, { intent: "save_timestamp", memberId: member(anna), numberingStyle: "none", timestamp: "70:00" }, origin);
  expect(rankCandidates(input([movie], { availableMinutes: "20" }))).toMatchObject({ kind: "no_match", reasons: ["time_mood_excluded"] });
  expect(rankCandidates(input([video]))).toMatchObject({ kind: "ranked", tier: "exact", candidates: [{ titleId: video, durationSeconds: 1440 }] });
  db.prepare("UPDATE titles SET provider_namespace='youtube',provider_id='synthetic11' WHERE id=?").run(video);
  for (const field of ["title", "contentType", "duration"]) db.prepare("INSERT INTO metadata_fields(title_id,field,origin,retrieved_at,expires_at) VALUES (?,?,'provider','2000-01-01T00:00:00.000Z','2000-02-01T00:00:00.000Z')").run(video, field);
  const snapshot = input([video]), before = histories(); expect(snapshot.titles[0]).toMatchObject({ title: null, contentType: null, durationSeconds: null });
  expect(rankCandidates(snapshot)).toMatchObject({ kind: "no_match", reasons: ["metadata_incomplete"], actions: ["complete_metadata"] }); expect(histories()).toBe(before);
});
