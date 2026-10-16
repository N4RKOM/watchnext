/** Adapter-neutral projections, never raw provider payloads. All lookups require review. */
export type ProviderNamespace = "youtube" | "kinopoisk_unofficial";
export type ProviderIdentity = { namespace: ProviderNamespace; externalId: string };
export type ContentType = "movie" | "series" | "anime" | "youtube";
export type SuggestionField = "title" | "year" | "contentType" | "duration" | "genres" | "coverUrl" | "sourceUrl" | "watchUrl";
export type LookupQuery = { kind: "detail"; externalId: string } | { kind: "search"; text: string };
export type FailureCode = "invalid_query" | "not_found_or_inaccessible" | "not_configured" | "quota_exhausted" | "rate_limited" | "network_error" | "timeout" | "provider_error" | "invalid_metadata" | "cancelled";
export type LookupFailure = { kind: "failure"; code: FailureCode; message: string; retry: "never" | "user" | "after_configuration" | "after_delay" | "after_provider_reset"; retryAfterSeconds: number | null; manualFallback: true };
export type Candidate = { identity: ProviderIdentity; title: string | null; year: number | null; contentType: ContentType | null; coverUrl: string | null };
export type MetadataItem = Candidate & {
  duration: { seconds: number | null; meaning: "full_item" | "typical_episode" | "unknown" };
  genres: string[]; sourceUrl: string | null; watchUrl: string | null;
  issues: { field: SuggestionField; reason: "missing" | "invalid" | "unsupported" | "uncertain" }[];
  manualFields: ("title" | "contentType" | "duration")[];
  requirements: ("review_metadata" | "choose_moods" | "choose_numbering" | "confirm_typical_episode_duration")[];
  provenance: { provider: ProviderNamespace; retrievedAt: string; acquiredFields: SuggestionField[]; origin: "provider_suggestions"; freshness: { policy: "youtube_public_30_days" | "provider_policy_unverified"; refreshBy: string | null; action: "refresh_or_delete" | "verify_policy_before_persistence" } };
};
export type LookupResult = LookupFailure | { kind: "available" | "incomplete"; item: MetadataItem }
  | { kind: "candidates"; candidates: Candidate[]; requiresSelection: true; omittedInvalidCandidates: boolean }
  | { kind: "no_match"; candidates: []; manualFallback: true };
/** Provider adapters map their response to these unknown-valued projections before validation. */
export type ItemProjection = { externalId?: unknown; title?: unknown; year?: unknown; contentType?: unknown; coverUrl?: unknown; sourceUrl?: unknown; watchUrl?: unknown; genres?: unknown; duration?: { seconds?: unknown; meaning?: unknown; verified?: unknown }; uncertainFields?: unknown };
export type ProviderReply = { kind: "item"; item: ItemProjection } | { kind: "search"; candidates: ItemProjection[] } | { kind: "failure"; code: FailureCode; retryAfterSeconds?: unknown };
export type MetadataProvider = { namespace: ProviderNamespace; lookup(query: LookupQuery, context: { signal?: AbortSignal }): Promise<ProviderReply> };
