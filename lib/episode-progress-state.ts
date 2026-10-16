export type EpisodeStyle = "season_episode" | "continuous";
export type EpisodePosition = "unknown" | "not_started" | "in_progress";
export type EpisodeProgress = { memberId: string; numberingStyle: EpisodeStyle; recorded: boolean; positionState: EpisodePosition; nextSeason: number | null; nextEpisode: number | null; completed: boolean };
export type EpisodeField = "positionState" | "nextSeason" | "nextEpisode";
export type EpisodeState = { kind: "idle" | "saved" | "error" | "invalid"; message?: string; errors?: Partial<Record<EpisodeField, string>>; progress?: EpisodeProgress };
export type EpisodeAction = (previous: EpisodeState, form: FormData) => Promise<EpisodeState>;
export function episodeStyle(style: string): style is EpisodeStyle { return style === "season_episode" || style === "continuous"; }
/** Pure read projection: absence is Unknown, never an implicitly saved episode 1. */
export function projectEpisodeProgress(memberId: string, numberingStyle: EpisodeStyle, row: { positionState: string | null; nextSeason: number | null; nextEpisode: number | null; completed: boolean | null } | null): EpisodeProgress {
  return { memberId, numberingStyle, recorded: row?.positionState != null, positionState: row?.positionState as EpisodePosition ?? "unknown", nextSeason: row?.nextSeason ?? null, nextEpisode: row?.nextEpisode ?? null, completed: row?.completed ?? false };
}
