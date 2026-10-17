/** Authorized, fresh caller projections. A group ID alone is not authorization. */
export type EligibilityMember = { readonly id: string; readonly groupId: string };
export type EligibilityTitle = {
  readonly id: string; readonly groupId: string; readonly archived: boolean;
  readonly title: string | null; readonly contentType: string | null;
  readonly durationSeconds: number | null; readonly numberingStyle: string;
  /** Canonical fixed mood codes, not translated display labels. */
  readonly moods: readonly string[];
};
export type EligibilityProgress = {
  readonly titleId: string; readonly memberId: string; readonly groupId: string;
  readonly numberingStyle: string; readonly completed: boolean;
  readonly positionState: string; readonly nextSeason: number | null; readonly nextEpisode: number | null;
};
export type EligibilityInput = {
  readonly groupId: string; readonly members: readonly EligibilityMember[];
  readonly titles: readonly EligibilityTitle[]; readonly progress: readonly EligibilityProgress[];
  readonly selectedViewerIds: readonly string[]; readonly rewatches?: boolean;
};
export type EpisodeCoordinate = { readonly nextSeason: number | null; readonly nextEpisode: number };
export type EpisodeTarget = EpisodeCoordinate & {
  readonly kind: "episode"; readonly numberingStyle: "continuous" | "season_episode";
  readonly restart: boolean; readonly catchUp: boolean;
};
export type ExclusionReason = "wrong_group" | "archived" | "metadata_incomplete" | "invalid_progress"
  | "completed_viewer" | "unknown_progress" | "different_positions";
export type TitleEligibility =
  | { readonly kind: "eligible"; readonly inputIndex: number; readonly titleId: string;
      readonly durationSeconds: number; readonly target: { readonly kind: "item" } | EpisodeTarget;
      readonly rewatchingViewerIds: readonly string[] }
  | { readonly kind: "excluded"; readonly inputIndex: number; readonly titleId?: string;
      readonly reason: ExclusionReason; readonly message: string; readonly viewerIds: readonly string[];
      readonly positions?: readonly (EpisodeCoordinate & { readonly memberId: string })[] };
export type EligibilityResult =
  | { readonly kind: "invalid_input"; readonly reason: "invalid_context" | "invalid_rewatches"; readonly message: string }
  | { readonly kind: "invalid_selection"; readonly reason: "empty_selection" | "duplicate_viewer" | "unavailable_viewer"; readonly message: string }
  | { readonly kind: "evaluated"; readonly rewatches: boolean; readonly titles: readonly TitleEligibility[] };
