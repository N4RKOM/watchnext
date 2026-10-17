// @vitest-environment node
import { expect, it } from "vitest";
import { rankCandidates } from "../../lib/picker/ranking";
import type { MoodCode, RankingInput, RankingTitle } from "../../lib/picker/ranking";
const createdAt = "2026-01-01T00:00:00.000Z";
const title = (id: string, durationSeconds: number, moods: readonly string[] = ["funny"], extra: Partial<RankingTitle> = {}): RankingTitle => ({
  id, groupId: "g", archived: false, title: `Saved ${id}`, contentType: "movie", durationSeconds, numberingStyle: "none", moods, createdAt, ...extra,
});
const base: RankingInput = { groupId: "g", members: [{ id: "anna", groupId: "g" }, { id: "max", groupId: "g" }], titles: [], progress: [], selectedViewerIds: ["anna", "max"], availableMinutes: "25", mood: "funny" };
const rank = (titles: readonly RankingTitle[], extra: Partial<RankingInput> = {}) => rankCandidates({ ...base, titles, ...extra });
const cases: { name: string; titles: RankingTitle[]; tier?: string; ids?: string[]; reasons?: string[] }[] = [
  { name: "exact Funny 24 then 18 minutes", titles: [title("18", 1080), title("24", 1440)], tier: "exact", ids: ["24", "18"] },
  { name: "25:00 exact suppresses 25:01 fallback", titles: [title("over", 1501), title("fits", 1500)], tier: "exact", ids: ["fits"] },
  { name: "exact tier suppresses both fallback tiers", titles: [title("over", 1501), title("dark", 1500, ["dark"]), title("exact", 1)], tier: "exact", ids: ["exact"] },
  { name: "no exact: same mood overrun smallest first including +300", titles: [title("300", 1800), title("1", 1501), title("60", 1560)], tier: "over_budget", ids: ["1", "60", "300"] },
  { name: "overrun tier suppresses within-budget other mood", titles: [title("other", 1500, ["dark"]), title("over", 1800)], tier: "over_budget", ids: ["over"] },
  { name: "+301 cannot relax time", titles: [title("too-long", 1801)], reasons: ["time_mood_excluded"] },
  { name: "wrong-mood over-budget cannot relax both filters", titles: [title("wrong", 1501, ["dark"])], reasons: ["time_mood_excluded"] },
  { name: "other mood only when earlier tiers empty, longest first", titles: [title("short", 100, ["dark"]), title("long", 1499, ["relaxing"])], tier: "different_mood", ids: ["long", "short"] },
  { name: "requested mood among multiple tags is exact", titles: [title("multi", 1500, ["dark", "funny"])], tier: "exact", ids: ["multi"] },
  { name: "requested mood among multiple tags is overrun not different", titles: [title("multi", 1501, ["dark", "funny"])], tier: "over_budget", ids: ["multi"] },
  { name: "multi-tag wrong mood within budget is disclosed fallback", titles: [title("multi", 1500, ["emotional", "dark"])], tier: "different_mood", ids: ["multi"] },
  { name: "no saved input", titles: [], reasons: ["no_active_titles"] },
  { name: "only archived", titles: [title("archived", 100, ["funny"], { archived: true })], reasons: ["no_active_titles"] },
  { name: "only foreign group", titles: [title("foreign-secret", 100, ["funny"], { groupId: "foreign" })], reasons: ["no_active_titles"] },
  { name: "only unavailable metadata", titles: [title("unavailable", 100, ["funny"], { durationSeconds: null })], reasons: ["metadata_incomplete"] },
];
it.each(cases)("ranking truth table: $name", test => {
  const result = rank(test.titles);
  if (test.tier) {
    expect(result).toMatchObject({ kind: "ranked", tier: test.tier, context: { availableMinutes: "25", budgetSeconds: 1500, mood: "funny", rewatches: false } });
    if (result.kind !== "ranked") throw new Error();
    expect(result.candidates.map(candidate => candidate.titleId)).toEqual(test.ids);
    expect(result.candidates.every(candidate => candidate.tier === test.tier)).toBe(true);
  } else expect(result).toMatchObject({ kind: "no_match", reasons: test.reasons });
});
it("discloses exact second/minute overrun and keeps the original budget unchanged", () => {
  const result = rank([title("1", 1501), title("61", 1561), title("300", 1800)]);
  if (result.kind !== "ranked") throw new Error();
  expect(result.candidates.map(item => [item.overrunSeconds, item.message])).toEqual([
    [1, "1 second longer than your available time."], [61, "1 minute 1 second longer than your available time."], [300, "5 minutes longer than your available time."],
  ]); expect(result.context.budgetSeconds).toBe(1500);
});
it("discloses requested and actual mood labels in fixed canonical order", () => {
  const result = rank([title("other", 1500, ["emotional", "dark", "dark"])]);
  if (result.kind !== "ranked") throw new Error();
  expect(result.candidates[0]).toMatchObject({ tier: "different_mood", overrunSeconds: 0, actualMoods: ["dark", "emotional"], message: "Requested Funny; different mood: Dark, Emotional. Within your available time." });
});
it.each(["exact", "over_budget", "different_mood"] as const)("%s ties use original creation instant then ordinal stable ID, independent of input arrival", tier => {
  const moods = tier === "different_mood" ? ["dark"] : ["funny"], seconds = tier === "over_budget" ? 1501 : 1500;
  const titles = [title("a", seconds, moods), title("z", seconds, moods, { createdAt: "2025-12-31T23:59:59.999Z" }), title("Z", seconds, moods), title("A", seconds, moods)];
  for (const input of [titles, [...titles].reverse()]) {
    const result = rank(input); if (result.kind !== "ranked") throw new Error();
    expect(result.tier).toBe(tier); expect(result.candidates.map(candidate => candidate.titleId)).toEqual(["z", "A", "Z", "a"]);
  }
});
it.each([undefined, null, "", "0", 0, -1, "-1", 1.5, "1.5", "1e2", "25.0", "+25", "025", " 25", "25 ", "Infinity", Infinity, NaN, "1441", 1441, [], {}, true].map(value => ({ value })))("rejects noncanonical/invalid time $value", ({ value }) => {
  expect(rank([], { availableMinutes: value } as RankingInput)).toMatchObject({ kind: "invalid_ranking", field: "availableMinutes" });
});
it.each([1, "1", 1440, "1440"].map(value => ({ value })))("accepts whole-minute budget boundary $value", ({ value }) => {
  const result = rank([title("item", 1)], { availableMinutes: value }); expect(result).toMatchObject({ kind: "ranked", context: { availableMinutes: value, budgetSeconds: Number(value) * 60 } });
});
it.each([undefined, null, "Funny", "custom", "", ["funny"], ["funny", "dark"], {}, 1].map(mood => ({ mood })))("rejects missing/array/unsupported single mood $mood", ({ mood }) => {
  expect(rank([], { mood: mood as MoodCode })).toMatchObject({ kind: "invalid_ranking", field: "mood" });
});
it.each([undefined, null, "", "2026-02-30T00:00:00.000Z", "2026-01-01", "2026-01-01T00:00:00Z", "2026-01-01T01:00:00.000+01:00", "not-a-date", 0].map(value => ({ value })))("rejects unusable/noncanonical original creation instant $value", ({ value }) => {
  expect(rank([title("item", 1, ["funny"], { createdAt: value as string })])).toMatchObject({ kind: "invalid_ranking", field: "titles" });
});
it("rejects ambiguous duplicate same-group projections instead of arbitrary stale winner", () => {
  expect(rank([title("same", 1500), title("same", 100)])).toMatchObject({ kind: "invalid_ranking", field: "titles" });
});
it("invalid viewer/context input remains distinct from no-match", () => {
  expect(rank([], { selectedViewerIds: [] })).toMatchObject({ kind: "invalid_selection", reason: "empty_selection" });
  expect(rank([], { selectedViewerIds: ["anna", "anna"] })).toMatchObject({ kind: "invalid_selection", reason: "duplicate_viewer" });
  expect(rank([], { selectedViewerIds: ["foreign"] })).toMatchObject({ kind: "invalid_selection", reason: "unavailable_viewer" });
  expect(rank([], { groupId: "" })).toMatchObject({ kind: "invalid_input" });
  expect(rank([], { rewatches: "true" } as unknown as RankingInput)).toMatchObject({ kind: "invalid_input", reason: "invalid_rewatches" });
});
it("recomputes eligibility: forged eligible fields, wrong groups, archive, metadata and viewer spoilers never return through fallback", () => {
  const titles = [title("complete", 1501), title("different", 1501, ["funny"], { contentType: "series", numberingStyle: "continuous" }),
    title("unknown", 1500, ["dark"], { contentType: "anime", numberingStyle: "continuous" }), title("foreign-secret", 1501, ["funny"], { groupId: "foreign" }),
    title("archive", 1500, ["dark"], { archived: true }), title("metadata", 1500, ["dark"], { contentType: null })];
  const progress = [
    { titleId: "complete", memberId: "anna", numberingStyle: "none", groupId: "g", completed: true, positionState: "unknown", nextSeason: null, nextEpisode: null },
    ...[["anna", 3], ["max", 7]].map(([memberId, nextEpisode]) => ({ titleId: "different", memberId: memberId as string, numberingStyle: "continuous", groupId: "g", completed: false, positionState: "in_progress", nextSeason: null, nextEpisode: nextEpisode as number })),
  ];
  const input = { ...base, titles: titles.map(item => ({ ...item, eligible: true })), progress, eligibleIds: titles.map(item => item.id) };
  const result = rankCandidates(input); expect(result).toMatchObject({ kind: "no_match", reasons: ["progress_required", "viewer_ineligible", "metadata_incomplete"], actions: ["set_progress", "review_viewers_or_rewatches", "complete_metadata"] });
  expect(JSON.stringify(result)).not.toContain("foreign-secret");
});
it("preserves exact episode/rewatching/restart target in fallback and full movie runtime despite timestamp", () => {
  const episodic = title("series", 1501, ["funny"], { contentType: "series", numberingStyle: "continuous" });
  const progress = [3, 7].map((nextEpisode, i) => ({ titleId: "series", memberId: i ? "max" : "anna", numberingStyle: "continuous", groupId: "g", completed: false, positionState: "in_progress", nextSeason: null, nextEpisode }));
  const result = rank([episodic], { progress, rewatches: true });
  expect(result).toMatchObject({ kind: "ranked", tier: "over_budget", candidates: [{ target: { kind: "episode", nextSeason: null, nextEpisode: 3, catchUp: true, restart: false }, rewatchingViewerIds: ["max"], durationSeconds: 1501 }] });
  expect(rank([episodic], { progress: progress.map(row => ({ ...row, completed: true })), rewatches: true })).toMatchObject({ candidates: [{ target: { nextEpisode: 1, restart: true }, rewatchingViewerIds: ["anna", "max"] }] });
  const movieProgress = { titleId: "movie", memberId: "anna", groupId: "g", numberingStyle: "none", completed: false, positionState: "unknown", nextSeason: null, nextEpisode: null, timestampSeconds: 4200 };
  expect(rank([title("movie", 5400)], { availableMinutes: 20, progress: [movieProgress] })).toMatchObject({ kind: "no_match", reasons: ["time_mood_excluded"] });
});
function freeze<T>(value: T): T { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
it("is deterministic and leaves frozen/deep-copied inputs unchanged; feedback/nonselected history has no influence", () => {
  const input = freeze({ ...base, titles: [title("a", 1500), title("b", 1080)] });
  const before = JSON.stringify(input), expected = rankCandidates(input);
  expect(rankCandidates(input)).toEqual(expected); expect(JSON.stringify(input)).toBe(before);
  const unrelated = { titleId: "a", memberId: "not-selected", groupId: "g", numberingStyle: "none", completed: true, positionState: "unknown", nextSeason: null, nextEpisode: null, rating: 1, note: "Ignore" };
  expect(rankCandidates({ ...input, progress: [unrelated] })).toEqual(expected);
});
