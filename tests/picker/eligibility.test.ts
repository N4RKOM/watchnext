// @vitest-environment node
import { describe, expect, it } from "vitest";
import { evaluateEligibility } from "../../lib/picker/eligibility";
import type { EligibilityInput, EligibilityProgress, EligibilityTitle } from "../../lib/picker/types";

const title: EligibilityTitle = { id: "title", groupId: "group", archived: false, title: "Saved series", contentType: "series", durationSeconds: 1500, numberingStyle: "continuous", moods: ["funny"] };
const base: EligibilityInput = { groupId: "group", members: ["anna", "max", "unselected"].map(id => ({ id, groupId: "group" })), titles: [title], progress: [], selectedViewerIds: ["anna", "max"] };
function row(memberId: string, next: number | "unknown" | "not_started" | "absent", completed = false, seasonal = false, season = 1): EligibilityProgress[] {
  if (next === "absent") return [];
  const state = typeof next === "number" ? "in_progress" : next;
  return [{ groupId: "group", titleId: "title", memberId, numberingStyle: seasonal ? "season_episode" : "continuous", completed,
    positionState: state, nextSeason: next === "unknown" || !seasonal ? null : season, nextEpisode: next === "unknown" ? null : next === "not_started" ? 1 : next }];
}
const evaluate = (input: Partial<EligibilityInput> = {}) => {
  const result = evaluateEligibility({ ...base, ...input });
  if (result.kind !== "evaluated") throw new Error(`Unexpected ${result.kind}`);
  return result.titles[0];
};
type Case = { name: string; a: number | "unknown" | "not_started" | "absent"; b?: number | "unknown" | "not_started" | "absent"; ac?: boolean; bc?: boolean; on?: boolean; target?: number; reason?: string; rewatch?: string[]; restart?: boolean; catchUp?: boolean };
const truthTable: Case[] = [
  { name: "single known unfinished default OFF targets exact next 3", a: 3, target: 3 },
  { name: "single known unfinished ON targets exact next 3", a: 3, on: true, target: 3 },
  { name: "single absent default OFF blocks Unknown", a: "absent", reason: "unknown_progress" },
  { name: "single explicit Not started defaults to episode 1", a: "not_started", target: 1 },
  { name: "all Not started OFF target 1", a: "not_started", b: "not_started", target: 1 },
  { name: "all Not started ON target 1 without rewatch", a: "not_started", b: "not_started", on: true, target: 1 },
  { name: "equal next 3 OFF targets 3", a: 3, b: 3, target: 3 },
  { name: "equal next 3 ON targets 3 without rewatch", a: 3, b: 3, on: true, target: 3 },
  { name: "different 3 vs 7 OFF excludes", a: 3, b: 7, reason: "different_positions" },
  { name: "different 3 vs 7 ON targets 3 Max rewatching", a: 3, b: 7, on: true, target: 3, rewatch: ["max"], catchUp: true },
  { name: "reversed 7 vs 3 ON targets 3 Anna rewatching", a: 7, b: 3, on: true, target: 3, rewatch: ["anna"], catchUp: true },
  { name: "Not started vs In progress 1 OFF are equivalent", a: "not_started", b: 1, target: 1 },
  { name: "Not started vs 7 OFF differs", a: "not_started", b: 7, reason: "different_positions" },
  { name: "Not started vs 7 ON targets 1", a: "not_started", b: 7, on: true, target: 1, rewatch: ["max"], catchUp: true },
  ...([false, true] as const).flatMap(on => (["unknown", "absent"] as const).map(b => ({ name: `unfinished ${b} blocks even with rewatches ${on}`, a: 3, b, on, reason: "unknown_progress" } as Case))),
  { name: "mixed completed known OFF excludes", a: 3, ac: true, b: 7, reason: "completed_viewer" },
  { name: "mixed completed Unknown OFF excludes", a: "unknown", ac: true, b: 7, reason: "completed_viewer" },
  { name: "mixed completed known ON follows unfinished 7", a: 3, ac: true, b: 7, on: true, target: 7, rewatch: ["anna"], catchUp: true },
  { name: "mixed completed Unknown ON follows unfinished 7", a: "unknown", ac: true, b: 7, on: true, target: 7, rewatch: ["anna"], catchUp: true },
  { name: "completed plus unfinished Unknown ON still blocks", a: 3, ac: true, b: "unknown", on: true, reason: "unknown_progress" },
  { name: "all completed known OFF excludes", a: 3, ac: true, b: 7, bc: true, reason: "completed_viewer" },
  { name: "all completed Unknown OFF excludes", a: "unknown", ac: true, b: "unknown", bc: true, reason: "completed_viewer" },
  { name: "all completed known ON restarts 1", a: 3, ac: true, b: 7, bc: true, on: true, target: 1, restart: true, rewatch: ["anna", "max"] },
  { name: "all completed Unknown ON restarts 1", a: "unknown", ac: true, b: "unknown", bc: true, on: true, target: 1, restart: true, rewatch: ["anna", "max"] },
  { name: "single completed Unknown ON restarts 1", a: "unknown", ac: true, on: true, target: 1, restart: true, rewatch: ["anna"] },
  { name: "maximum 9999 coordinate stays exact", a: 9999, b: 9999, target: 9999 },
];
for (const seasonal of [false, true]) describe(seasonal ? "season/episode truth table" : "continuous truth table", () => {
  it.each(truthTable)("$name", test => {
    const result = evaluate({ titles: [{ ...title, contentType: seasonal ? "series" : "anime", numberingStyle: seasonal ? "season_episode" : "continuous" }],
      selectedViewerIds: test.b === undefined ? ["anna"] : ["anna", "max"], rewatches: test.on,
      progress: [...row("anna", test.a, test.ac, seasonal), ...row("max", test.b ?? "absent", test.bc, seasonal)] });
    if (test.reason) expect(result).toMatchObject({ kind: "excluded", reason: test.reason });
    else expect(result).toEqual({ kind: "eligible", inputIndex: 0, titleId: "title", durationSeconds: 1500,
      target: { kind: "episode", numberingStyle: seasonal ? "season_episode" : "continuous", nextSeason: seasonal ? 1 : null, nextEpisode: test.target,
        restart: test.restart ?? false, catchUp: test.catchUp ?? false }, rewatchingViewerIds: test.rewatch ?? [] });
  });
});
it("orders S1E12 before S2E1 without inventing season length or incrementing", () => {
  const input = { titles: [{ ...title, numberingStyle: "season_episode" }], progress: [...row("anna", 12, false, true, 1), ...row("max", 1, false, true, 2)] };
  expect(evaluate({ ...input, rewatches: true })).toMatchObject({ kind: "eligible", target: { nextSeason: 1, nextEpisode: 12, catchUp: true }, rewatchingViewerIds: ["max"] });
  expect(evaluate(input)).toMatchObject({ reason: "different_positions", positions: [{ memberId: "anna", nextSeason: 1, nextEpisode: 12 }, { memberId: "max", nextSeason: 2, nextEpisode: 1 }] });
});
it("retains maximum seasonal coordinates without increment and excludes malformed completed history safely", () => {
  const input = { titles: [{ ...title, numberingStyle: "season_episode" }], progress: [...row("anna", 9999, false, true, 9999), ...row("max", 9999, false, true, 9999)] };
  expect(evaluate(input)).toMatchObject({ kind: "eligible", target: { nextSeason: 9999, nextEpisode: 9999 } });
  expect(evaluate({ ...input, rewatches: true, progress: [{ ...input.progress[0], completed: true, nextEpisode: 0 }] })).toMatchObject({ reason: "invalid_progress", viewerIds: ["anna"] });
});
it.each(["movie", "youtube"])("%s completion only: timestamps do not shorten runtime or imply completion", contentType => {
  const movie = { ...title, contentType, numberingStyle: "none" };
  const progress = { ...row("anna", "unknown")[0], numberingStyle: "none", timestampSeconds: 1500, rating: 1, note: "Ignore" };
  expect(evaluate({ titles: [movie], progress: [progress] })).toEqual({ kind: "eligible", inputIndex: 0, titleId: "title", durationSeconds: 1500, target: { kind: "item" }, rewatchingViewerIds: [] });
  expect(evaluate({ titles: [movie], progress: [{ ...progress, completed: true }] })).toMatchObject({ reason: "completed_viewer", viewerIds: ["anna"] });
  expect(evaluate({ titles: [movie], progress: [{ ...progress, completed: true }], rewatches: true })).toMatchObject({ kind: "eligible", durationSeconds: 1500, rewatchingViewerIds: ["anna"] });
  expect(evaluate({ titles: [movie], progress: ["anna", "max"].map(memberId => ({ ...progress, memberId, completed: true })), rewatches: true })).toMatchObject({ kind: "eligible", rewatchingViewerIds: ["anna", "max"] });
  expect(evaluate({ titles: [movie], progress: [{ ...progress, memberId: "unselected", completed: true }] })).toMatchObject({ kind: "eligible", rewatchingViewerIds: [] });
  expect(evaluate({ titles: [movie] })).toMatchObject({ kind: "eligible" });
});
it.each([0, -1, 1.5, 10000, NaN, Infinity, null, "3"])("rejects invalid unfinished episode %s", value => {
  const progress = [{ ...row("anna", 3)[0], nextEpisode: value }] as EligibilityProgress[];
  expect(evaluate({ selectedViewerIds: ["anna"], progress })).toMatchObject({ reason: "invalid_progress", viewerIds: ["anna"] });
});
it("rejects bad states, seasons, style, duplicate and cross-group progress safely", () => {
  for (const extra of [{ positionState: "finished" }, { positionState: "unknown" }, { positionState: "not_started" }, { nextSeason: 1 }, { numberingStyle: "none" }, { groupId: "foreign-secret" }, { completed: 1 }]) {
    expect(evaluate({ selectedViewerIds: ["anna"], progress: [{ ...row("anna", 3)[0], ...extra }] as EligibilityProgress[] })).toMatchObject({ reason: "invalid_progress" });
  }
  expect(evaluate({ selectedViewerIds: ["anna"], progress: [...row("anna", 3), ...row("anna", 3)] })).toMatchObject({ reason: "invalid_progress" });
  for (const nextSeason of [null, 0, 10000, 1.5]) expect(evaluate({ titles: [{ ...title, numberingStyle: "season_episode" }], selectedViewerIds: ["anna"], progress: [{ ...row("anna", 3, false, true)[0], nextSeason }] })).toMatchObject({ reason: "invalid_progress" });
});
it.each([[], ["anna", "anna"], ["missing"], ["foreign"], [""]].map(selectedViewerIds => ({ selectedViewerIds })))("rejects invalid selection $selectedViewerIds without title/progress disclosure", ({ selectedViewerIds }) => {
  const result = evaluateEligibility({ ...base, selectedViewerIds, members: [...base.members, { id: "foreign", groupId: "secret-group" }] });
  expect(result.kind).toBe("invalid_selection"); expect(result).not.toHaveProperty("titles"); expect(JSON.stringify(result)).not.toContain("secret-group");
});
it.each([null, "false", 0, {}, []].map(rewatches => ({ rewatches })))("rejects malformed rewatch input $rewatches rather than coercing", ({ rewatches }) => expect(evaluateEligibility({ ...base, rewatches } as EligibilityInput)).toMatchObject({ kind: "invalid_input", reason: "invalid_rewatches" }));
it("rejects malformed context, selection and ambiguous member snapshots", () => {
  expect(evaluateEligibility({ ...base, groupId: "" })).toMatchObject({ kind: "invalid_input" });
  expect(evaluateEligibility({ ...base, selectedViewerIds: null } as unknown as EligibilityInput)).toMatchObject({ kind: "invalid_selection" });
  expect(evaluateEligibility({ ...base, members: [...base.members, base.members[0]] })).toMatchObject({ kind: "invalid_selection" });
});
it("valid empty watchlist remains distinct from invalid selection and returns no fabricated result", () => {
  expect(evaluateEligibility({ ...base, titles: [] })).toEqual({ kind: "evaluated", rewatches: false, titles: [] });
  expect(evaluateEligibility({ ...base, titles: [], selectedViewerIds: [] })).toMatchObject({ kind: "invalid_selection", reason: "empty_selection" });
});
it.each([0, -1, 1.5, 86401, null, NaN, Infinity])("excludes unavailable/invalid required duration %s", durationSeconds => expect(evaluate({ titles: [{ ...title, durationSeconds }] })).toMatchObject({ reason: "metadata_incomplete" }));
it.each([1, 86400])("accepts duration boundary %i without timestamp subtraction", durationSeconds => expect(evaluate({ titles: [{ ...title, durationSeconds, contentType: "movie", numberingStyle: "none" }] })).toMatchObject({ kind: "eligible", durationSeconds }));
it("excludes required metadata but ignores missing optional links/genres/covers", () => {
  for (const extra of [{ title: null }, { title: " " }, { title: "x".repeat(201) }, { contentType: null }, { contentType: "unsupported" }, { moods: [] }, { moods: ["Funny"] }, { moods: ["custom"] }, { numberingStyle: "none" }]) expect(evaluate({ titles: [{ ...title, ...extra }] })).toMatchObject({ reason: "metadata_incomplete" });
  expect(evaluate({ titles: [{ ...title, contentType: "movie", numberingStyle: "none" }] })).toMatchObject({ kind: "eligible" });
});
it("wrong-group exclusion returns no foreign ID/name/metadata; archived titles never qualify", () => {
  const result = evaluate({ titles: [{ ...title, groupId: "foreign-secret", id: "foreign-id", title: "foreign-name" }] });
  expect(result).toEqual({ kind: "excluded", inputIndex: 0, reason: "wrong_group", message: "This entry is unavailable in the current group.", viewerIds: [] });
  expect(evaluate({ titles: [{ ...title, archived: true }] })).toMatchObject({ reason: "archived" });
});
function freeze<T>(value: T): T { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
it("is deterministic, mutation-free and independent of nonselected history/feedback", () => {
  const input = freeze({ ...base, progress: [...row("anna", 3), ...row("max", 3)], titles: [title, { ...title, id: "unrelated", contentType: "movie", numberingStyle: "none" }] });
  const before = JSON.stringify(input), expected = evaluateEligibility(input);
  expect(evaluateEligibility(input)).toEqual(expected); expect(JSON.stringify(input)).toBe(before);
  const unrelated = { ...row("unselected", "unknown", true)[0], rating: 10, note: "change" };
  expect(evaluateEligibility({ ...input, progress: [...input.progress, unrelated] })).toEqual(expected);
  const changed = evaluateEligibility({ ...input, progress: [...row("anna", 4), ...row("max", 3)] });
  if (changed.kind !== "evaluated" || expected.kind !== "evaluated") throw new Error();
  expect(changed.titles[0]).toMatchObject({ reason: "different_positions" }); expect(changed.titles[1]).toEqual(expected.titles[1]);
});
