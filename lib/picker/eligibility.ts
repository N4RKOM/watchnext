import { contentTypes, fixedMoods } from "../title-state";
import type { EligibilityInput, EligibilityProgress, EligibilityResult, EligibilityTitle, EpisodeCoordinate, ExclusionReason, TitleEligibility } from "./types";

const id = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const coordinate = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 9999;
const compare = (a: EpisodeCoordinate, b: EpisodeCoordinate) => (a.nextSeason ?? 0) - (b.nextSeason ?? 0) || a.nextEpisode - b.nextEpisode;
const messages: Record<ExclusionReason, string> = {
  wrong_group: "This entry is unavailable in the current group.", archived: "This entry is archived.",
  metadata_incomplete: "Complete the title, type, duration, moods and numbering before picking.",
  invalid_progress: "Correct the selected viewers' invalid progress before picking.",
  completed_viewer: "A selected viewer finished this title. Enable rewatches to include it.",
  unknown_progress: "Set the unfinished selected viewers' next episode before picking.",
  different_positions: "Selected viewers have different next episodes. Enable rewatches for catch-up.",
};
function usable(title: EligibilityTitle) {
  return typeof title.title === "string" && title.title.trim().length > 0 && [...title.title].length <= 200
    && contentTypes.some(type => type.value === title.contentType)
    && Number.isInteger(title.durationSeconds) && title.durationSeconds! >= 1 && title.durationSeconds! <= 86400
    && Array.isArray(title.moods) && title.moods.length > 0 && title.moods.every(mood => fixedMoods.some(fixed => fixed.value === mood))
    && (title.contentType === "movie" || title.contentType === "youtube"
      ? title.numberingStyle === "none" : title.numberingStyle === "continuous" || title.numberingStyle === "season_episode");
}
function position(row: EligibilityProgress, seasonal: boolean): EpisodeCoordinate | "unknown" | "invalid" {
  if (row.positionState === "unknown") return row.nextSeason === null && row.nextEpisode === null ? "unknown" : "invalid";
  if (row.positionState !== "not_started" && row.positionState !== "in_progress") return "invalid";
  if (!coordinate(row.nextEpisode) || (seasonal ? !coordinate(row.nextSeason) : row.nextSeason !== null)) return "invalid";
  if (row.positionState === "not_started" && (row.nextEpisode !== 1 || (seasonal && row.nextSeason !== 1))) return "invalid";
  return { nextSeason: row.nextSeason, nextEpisode: row.nextEpisode };
}

/** Pure eligibility only: no I/O, freshness enforcement, ordering, mood/time ranking or writes. */
export function evaluateEligibility(input: EligibilityInput): EligibilityResult {
  if (!input || !id(input.groupId) || !Array.isArray(input.members) || !Array.isArray(input.titles) || !Array.isArray(input.progress)) {
    return { kind: "invalid_input", reason: "invalid_context", message: "Provide an authorized group snapshot." };
  }
  if (input.rewatches !== undefined && typeof input.rewatches !== "boolean") {
    return { kind: "invalid_input", reason: "invalid_rewatches", message: "Rewatch permission must be true or false." };
  }
  const viewers = input.selectedViewerIds;
  if (!Array.isArray(viewers) || viewers.length === 0) return { kind: "invalid_selection", reason: "empty_selection", message: "Select at least one viewer." };
  if (new Set(viewers).size !== viewers.length) return { kind: "invalid_selection", reason: "duplicate_viewer", message: "Select each viewer once." };
  if (viewers.some(viewer => !id(viewer) || input.members.filter(member => member?.id === viewer).length !== 1
    || !input.members.some(member => member?.id === viewer && member.groupId === input.groupId))) {
    return { kind: "invalid_selection", reason: "unavailable_viewer", message: "A selected viewer is unavailable in this group." };
  }
  const rewatches = input.rewatches ?? false;
  return { kind: "evaluated", rewatches, titles: input.titles.map((title, inputIndex): TitleEligibility => {
    const excluded = (reason: ExclusionReason, viewerIds: readonly string[] = []): Extract<TitleEligibility, { kind: "excluded" }> => ({
      kind: "excluded", inputIndex, ...(title?.groupId === input.groupId && id(title.id) ? { titleId: title.id } : {}),
      reason, message: messages[reason], viewerIds: [...viewerIds],
    });
    if (!title || title.groupId !== input.groupId) return excluded("wrong_group");
    if (title.archived === true) return excluded("archived");
    if (!id(title.id) || title.archived !== false || !usable(title)) return excluded("metadata_incomplete");
    const rows = viewers.map(memberId => input.progress.filter(row => row?.titleId === title.id && row.memberId === memberId));
    const invalid = viewers.filter((_, index) => rows[index].length > 1 || rows[index].some(row => row.groupId !== input.groupId
      || row.numberingStyle !== title.numberingStyle || typeof row.completed !== "boolean"
      || (title.numberingStyle !== "none" && position(row, title.numberingStyle === "season_episode") === "invalid")));
    if (invalid.length) return excluded("invalid_progress", invalid);
    const completed = viewers.filter((_, index) => rows[index][0]?.completed === true);
    if (!rewatches && completed.length) return excluded("completed_viewer", completed);
    const eligible = (target: Extract<TitleEligibility, {kind: "eligible"}>["target"], rewatchingViewerIds: readonly string[]): TitleEligibility => ({
      kind: "eligible", inputIndex, titleId: title.id, durationSeconds: title.durationSeconds!, target, rewatchingViewerIds: [...rewatchingViewerIds],
    });
    if (title.numberingStyle === "none") return eligible({ kind: "item" }, completed);
    const seasonal = title.numberingStyle === "season_episode";
    const unfinished = viewers.flatMap((memberId, index) => rows[index][0]?.completed ? [] : [{ memberId,
      position: rows[index][0] ? position(rows[index][0], seasonal) : "unknown" as const }]);
    const invalidPositions = unfinished.filter(row => row.position === "invalid").map(row => row.memberId);
    if (invalidPositions.length) return excluded("invalid_progress", invalidPositions);
    const unknown = unfinished.filter(row => row.position === "unknown").map(row => row.memberId);
    if (unknown.length) return excluded("unknown_progress", unknown);
    const positions = unfinished.map(row => ({ memberId: row.memberId, ...(row.position as EpisodeCoordinate) }));
    const first: EpisodeCoordinate = { nextSeason: seasonal ? 1 : null, nextEpisode: 1 };
    const target = positions.reduce<EpisodeCoordinate>((least, row) => compare(row, least) < 0 ? row : least, positions[0] ?? first);
    const ahead = positions.filter(row => compare(row, target) > 0).map(row => row.memberId);
    if (!rewatches && ahead.length) return { ...excluded("different_positions", viewers), positions };
    const rewatching = viewers.filter(viewer => completed.includes(viewer) || ahead.includes(viewer));
    return eligible({ kind: "episode", numberingStyle: seasonal ? "season_episode" : "continuous", nextSeason: target.nextSeason,
      nextEpisode: target.nextEpisode, restart: positions.length === 0, catchUp: positions.length > 0 && rewatching.length > 0 }, rewatching);
  }) };
}
