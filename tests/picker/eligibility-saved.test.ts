// @vitest-environment node
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, expect, it } from "vitest";
import { migrate } from "../../db/migrate";
import { createGroup } from "../../lib/groups";
import { acceptInvitation, requireSession, sessionCookieName } from "../../lib/sessions";
import { changeProfile } from "../../lib/profiles";
import { saveTitle } from "../../lib/shared-save";
import { readTitleDetails } from "../../lib/title-details";
import { fixedMoods } from "../../lib/title-state";
import { updateEpisodeProgress } from "../../lib/episode-progress";
import { updateWatchProgress } from "../../lib/watch-progress";
import { updateOwnRating } from "../../lib/ratings";
import { updateOwnNote } from "../../lib/notes";
import { removeOwnContribution, restoreTitle } from "../../lib/contributions";
import { evaluateEligibility } from "../../lib/picker/eligibility";
import type { EligibilityInput, EligibilityProgress } from "../../lib/picker/types";

let db: DatabaseSync, anna: string, max: string, outsider: string, series: string, movie: string, foreign: string;
const origin = "https://watch.example";
const req = (cookie = anna) => new Request(origin, { method: "POST", headers: { origin, cookie: `${sessionCookieName}=${cookie}` } });
const member = (cookie: string) => requireSession(db, cookie).activeMemberId!;
const histories = () => JSON.stringify(["progress", "ratings", "notes"].map(table => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()));
const all = () => JSON.stringify(["titles", "contributors", "progress", "ratings", "notes", "metadata_fields", "title_moods"].map(table => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()));
function save(title: string, contentType: string, numberingStyle: string, cookie = anna) {
  const result = saveTitle(db, req(cookie), { kind: "manual", fields: { title, contentType, minutes: "25", seconds: "0", numberingStyle, genres: "", moods: ["funny"], watchUrl: "" } }, origin);
  if (result.kind !== "created") throw new Error(); return result.id;
}
function episode(cookie: string, intent: string, extra: Record<string, unknown> = {}) {
  return updateEpisodeProgress(db, req(cookie), series, { intent, memberId: member(cookie), numberingStyle: "season_episode", ...extra }, origin);
}
/** Test-only projection from existing authorized fresh detail reads. No new runtime query. */
function snapshot(ids = [series, movie]): EligibilityInput {
  const session = requireSession(db, anna), details = ids.map(id => readTitleDetails(db, req(), id));
  return { groupId: session.groupId, selectedViewerIds: [member(anna), member(max)],
    members: details[0].history.map(row => ({ id: row.id, groupId: session.groupId })),
    titles: details.map(detail => ({ id: detail.id, groupId: session.groupId, title: detail.title, contentType: detail.contentType,
      durationSeconds: detail.durationSeconds, archived: detail.archived, numberingStyle: detail.numberingStyle,
      moods: detail.moods.map(label => fixedMoods.find(mood => mood.label === label)!.value) })),
    progress: details.flatMap(detail => detail.history.filter(history => history.completed !== null).map(history => ({
      titleId: detail.id, groupId: session.groupId, memberId: history.id, numberingStyle: detail.numberingStyle,
      completed: history.completed!, positionState: history.positionState!, nextSeason: history.nextSeason, nextEpisode: history.nextEpisode,
    } satisfies EligibilityProgress))),
  };
}
function result(input = snapshot()) { const evaluated = evaluateEligibility(input); if (evaluated.kind !== "evaluated") throw new Error(); return evaluated.titles; }
beforeEach(() => {
  db = new DatabaseSync(":memory:"); migrate(db);
  const invite = createGroup(db, "Group", origin).inviteUrl.split("/").at(-1)!;
  anna = acceptInvitation(db, invite); max = acceptInvitation(db, invite);
  outsider = acceptInvitation(db, createGroup(db, "Other", origin).inviteUrl.split("/").at(-1)!);
  for (const [cookie, name] of [[anna, "Anna"], [max, "Max"], [outsider, "Other"]]) changeProfile(db, req(cookie), { intent: "create", name, color: "#1d4ed8" }, origin);
  series = save("Saved series", "series", "season_episode"); movie = save("Saved movie", "movie", "none"); foreign = save("Foreign title", "movie", "none", outsider);
});
afterEach(() => db.close());
it("real absent/Not started/next-episode saves produce Unknown/equal/catch-up without changing stored state", () => {
  expect(result()[0]).toMatchObject({ reason: "unknown_progress", viewerIds: [member(anna), member(max)] });
  episode(anna, "save_position", { positionState: "not_started" }); episode(max, "save_position", { positionState: "in_progress", nextSeason: "1", nextEpisode: "1" });
  const before = all(); expect(result()[0]).toMatchObject({ kind: "eligible", target: { nextSeason: 1, nextEpisode: 1, catchUp: false } }); expect(all()).toBe(before);
  episode(max, "save_position", { positionState: "in_progress", nextSeason: "2", nextEpisode: "1" });
  const input = snapshot(), stored = all(); expect(result(input)[0]).toMatchObject({ reason: "different_positions" });
  expect(result({ ...input, rewatches: true })[0]).toMatchObject({ target: { nextSeason: 1, nextEpisode: 1, catchUp: true }, rewatchingViewerIds: [member(max)] }); expect(all()).toBe(stored);
});
it("real completion-only Unknown rows follow unfinished coordinates or restart all-complete without fabricating history", () => {
  episode(anna, "complete"); episode(max, "save_position", { positionState: "in_progress", nextSeason: "2", nextEpisode: "7" });
  const first = snapshot(), before = histories(); expect(result(first)[0]).toMatchObject({ reason: "completed_viewer" });
  expect(result({ ...first, rewatches: true })[0]).toMatchObject({ target: { nextSeason: 2, nextEpisode: 7, restart: false }, rewatchingViewerIds: [member(anna)] }); expect(histories()).toBe(before);
  episode(max, "save_position", { positionState: "unknown" }); episode(max, "complete");
  const second = snapshot(), saved = histories(); expect(result({ ...second, rewatches: true })[0]).toMatchObject({ target: { nextSeason: 1, nextEpisode: 1, restart: true }, rewatchingViewerIds: [member(anna), member(max)] }); expect(histories()).toBe(saved);
  episode(max, "undo_completion"); expect(result({ ...snapshot(), rewatches: true })[0]).toMatchObject({ reason: "unknown_progress", viewerIds: [member(max)] });
});
it("real full-runtime timestamp/completion and rating/note edits preserve independent title results", () => {
  updateWatchProgress(db, req(), movie, { intent: "save_timestamp", memberId: member(anna), numberingStyle: "none", timestamp: "25:00" }, origin);
  const input = snapshot(), initial = result(input); expect(initial[1]).toMatchObject({ kind: "eligible", durationSeconds: 1500 });
  updateOwnRating(db, req(max), movie, { intent: "save_rating", memberId: member(max), score: "10" }, origin);
  updateOwnNote(db, req(), series, { intent: "save_note", memberId: member(anna), body: "Ignore for picks" }, origin);
  expect(result()).toEqual(initial);
  updateWatchProgress(db, req(max), movie, { intent: "complete", memberId: member(max), numberingStyle: "none" }, origin);
  const changed = result(); expect(changed[0]).toEqual(initial[0]); expect(changed[1]).toMatchObject({ reason: "completed_viewer", viewerIds: [member(max)] });
  expect(result({ ...snapshot(), selectedViewerIds: [member(anna)] })[1]).toMatchObject({ kind: "eligible", durationSeconds: 1500 });
  expect(result({ ...snapshot(), rewatches: true })[1]).toMatchObject({ kind: "eligible", rewatchingViewerIds: [member(max)] });
});
it("real archive/restore preserves history and actual group guards prevent foreign projection", () => {
  episode(anna, "complete"); const before = histories();
  removeOwnContribution(db, req(), series, {}, origin); expect(result({ ...snapshot(), rewatches: true })[0]).toMatchObject({ reason: "archived" });
  restoreTitle(db, req(), series, {}, origin); expect(histories()).toBe(before);
  expect(result({ ...snapshot(), rewatches: true })[0]).toMatchObject({ reason: "unknown_progress", viewerIds: [member(max)] });
  expect(() => snapshot([foreign])).toThrow();
});
it("caller freshness enforcement clears expired provider fields before pure evaluation without reconstructing metadata", () => {
  db.prepare("UPDATE titles SET provider_namespace='youtube',provider_id='synthetic11' WHERE id=?").run(movie);
  for (const field of ["title", "contentType", "duration"]) db.prepare("INSERT INTO metadata_fields(title_id,field,origin,retrieved_at,expires_at) VALUES (?,?,'provider','2000-01-01T00:00:00.000Z','2000-02-01T00:00:00.000Z')").run(movie, field);
  const projection = snapshot(), before = all(); expect(projection.titles[1]).toMatchObject({ title: null, contentType: null, durationSeconds: null });
  expect(result(projection)[1]).toMatchObject({ reason: "metadata_incomplete" }); expect(all()).toBe(before);
});
