import { fixedMoods } from "../title-state";
import { evaluateEligibility } from "./eligibility";
import type { EligibilityInput, EligibilityResult, EligibilityTitle, TitleEligibility } from "./types";

export type MoodCode = typeof fixedMoods[number]["value"];
export type RankingTitle = EligibilityTitle & { readonly createdAt: string };
export type RankingInput = Omit<EligibilityInput, "titles"> & {
  readonly titles: readonly RankingTitle[];
  readonly availableMinutes: string | number;
  readonly mood: MoodCode;
};
export type CandidateTier = "exact" | "over_budget" | "different_mood";
type Eligible = Extract<TitleEligibility, {kind: "eligible"}>;
type Evaluated = Extract<EligibilityResult, {kind: "evaluated"}>;
export type RankedCandidate = Eligible & {
  readonly tier: CandidateTier; readonly overrunSeconds: number;
  readonly actualMoods: readonly MoodCode[]; readonly message: string;
};
export type NoMatchReason = "no_active_titles" | "progress_required" | "viewer_ineligible" | "metadata_incomplete" | "time_mood_excluded";
export type AdjustmentAction = "add_title" | "set_progress" | "review_viewers_or_rewatches" | "complete_metadata" | "adjust_time_or_mood";
type Context = { readonly availableMinutes: string | number; readonly budgetSeconds: number; readonly mood: MoodCode;
  readonly selectedViewerIds: readonly string[]; readonly rewatches: boolean };
export type RankingResult = Exclude<EligibilityResult, Evaluated>
  | { readonly kind: "invalid_ranking"; readonly field: "availableMinutes" | "mood" | "titles"; readonly message: string }
  | { readonly kind: "ranked"; readonly tier: CandidateTier; readonly candidates: readonly RankedCandidate[]; readonly context: Context; readonly eligibility: Evaluated }
  | { readonly kind: "no_match"; readonly reasons: readonly NoMatchReason[]; readonly actions: readonly AdjustmentAction[];
      readonly message: string; readonly context: Context; readonly eligibility: Evaluated };

function budget(value: unknown): number | null {
  if (typeof value === "number") return Number.isInteger(value) && value >= 1 && value <= 1440 ? value * 60 : null;
  if (typeof value !== "string" || !/^[1-9][0-9]{0,3}$/.test(value)) return null;
  const minutes = Number(value); return minutes <= 1440 ? minutes * 60 : null;
}
function instant(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value ? parsed : null;
}
const ordinal = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
function deltaLabel(seconds: number) {
  const minutes = Math.floor(seconds / 60), rest = seconds % 60;
  return [minutes ? `${minutes} ${minutes === 1 ? "minute" : "minutes"}` : "", rest ? `${rest} ${rest === 1 ? "second" : "seconds"}` : ""].filter(Boolean).join(" ");
}

/** Recomputes eligibility from this same snapshot; accepts no authoritative eligible flag/list. */
export function rankCandidates(input: RankingInput): RankingResult {
  const eligibility = evaluateEligibility(input);
  if (eligibility.kind !== "evaluated") return eligibility;
  const budgetSeconds = budget(input.availableMinutes);
  if (budgetSeconds === null) return { kind: "invalid_ranking", field: "availableMinutes", message: "Enter whole minutes from 1 to 1440." };
  if (!fixedMoods.some(mood => mood.value === input.mood)) return { kind: "invalid_ranking", field: "mood", message: "Choose exactly one supported mood." };
  const ownIds = input.titles.filter(title => title?.groupId === input.groupId).map(title => title.id);
  if (new Set(ownIds).size !== ownIds.length) return { kind: "invalid_ranking", field: "titles", message: "Provide one current projection per saved title." };
  const eligible = eligibility.titles.filter((title): title is Eligible => title.kind === "eligible");
  const creation = new Map<number, number>();
  for (const result of eligible) {
    const title = input.titles[result.inputIndex], createdAt = instant(title.createdAt);
    if (title.id !== result.titleId || createdAt === null) return { kind: "invalid_ranking", field: "titles", message: "Original title creation metadata is unavailable or inconsistent." };
    creation.set(result.inputIndex, createdAt);
  }
  const context: Context = { availableMinutes: input.availableMinutes, budgetSeconds, mood: input.mood,
    selectedViewerIds: [...input.selectedViewerIds], rewatches: eligibility.rewatches };
  const containsMood = (result: Eligible) => input.titles[result.inputIndex].moods.includes(input.mood);
  const exact = eligible.filter(result => containsMood(result) && result.durationSeconds <= budgetSeconds);
  const over = exact.length ? [] : eligible.filter(result => containsMood(result) && result.durationSeconds > budgetSeconds && result.durationSeconds <= budgetSeconds + 300);
  const different = exact.length || over.length ? [] : eligible.filter(result => !containsMood(result) && result.durationSeconds <= budgetSeconds);
  const tier: CandidateTier = exact.length ? "exact" : over.length ? "over_budget" : "different_mood";
  const chosen = exact.length ? exact : over.length ? over : different;
  if (chosen.length) {
    const ordered = [...chosen].sort((a, b) => (tier === "over_budget" ? a.durationSeconds - b.durationSeconds : b.durationSeconds - a.durationSeconds)
      || creation.get(a.inputIndex)! - creation.get(b.inputIndex)! || ordinal(a.titleId, b.titleId));
    const requested = fixedMoods.find(mood => mood.value === input.mood)!.label;
    const candidates = ordered.map((result): RankedCandidate => {
      const actualMoods = fixedMoods.filter(mood => input.titles[result.inputIndex].moods.includes(mood.value)).map(mood => mood.value);
      const overrunSeconds = Math.max(0, result.durationSeconds - budgetSeconds);
      return { ...result, tier, actualMoods, overrunSeconds, message: tier === "exact" ? "Matches your mood and fits your available time."
        : tier === "over_budget" ? `${deltaLabel(overrunSeconds)} longer than your available time.`
        : `Requested ${requested}; different mood: ${fixedMoods.filter(mood => actualMoods.includes(mood.value)).map(mood => mood.label).join(", ")}. Within your available time.` };
    });
    return { kind: "ranked", tier, candidates, context, eligibility };
  }
  const reasons: NoMatchReason[] = [], actions: AdjustmentAction[] = [];
  const exclusions = eligibility.titles.filter((title): title is Extract<TitleEligibility, {kind: "excluded"}> => title.kind === "excluded");
  const has = (...codes: readonly string[]) => exclusions.some(result => codes.includes(result.reason));
  const add = (reason: NoMatchReason, action: AdjustmentAction) => { reasons.push(reason); actions.push(action); };
  if (eligibility.titles.length === 0 || eligibility.titles.every(result => result.kind === "excluded" && ["archived", "wrong_group"].includes(result.reason))) add("no_active_titles", "add_title");
  if (has("unknown_progress", "invalid_progress")) add("progress_required", "set_progress");
  if (has("completed_viewer", "different_positions")) add("viewer_ineligible", "review_viewers_or_rewatches");
  if (has("metadata_incomplete")) add("metadata_incomplete", "complete_metadata");
  if (eligible.length) add("time_mood_excluded", "adjust_time_or_mood");
  return { kind: "no_match", reasons, actions, message: "No saved item matches these viewers and the permitted time/mood tiers. Keep your inputs or adjust them explicitly.", context, eligibility };
}
