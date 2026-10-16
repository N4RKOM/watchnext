import { safeExternalUrl } from "../urls";
import type { Candidate, ContentType, FailureCode, ItemProjection, LookupFailure, LookupQuery, LookupResult, MetadataItem, MetadataProvider, ProviderIdentity, ProviderNamespace, SuggestionField } from "./types";

const failures: Record<FailureCode, [string, LookupFailure["retry"]]> = {
  invalid_query: ["Enter a supported title search or provider ID.", "never"],
  not_found_or_inaccessible: ["This title could not be found or accessed. You can add it manually.", "user"],
  not_configured: ["This provider is not configured. You can add the title manually.", "after_configuration"],
  quota_exhausted: ["The provider quota is exhausted. Try after it resets or add manually.", "after_provider_reset"],
  rate_limited: ["The provider is receiving too many requests. Try later or add manually.", "after_delay"],
  network_error: ["The provider could not be reached. Retry or add manually.", "user"],
  timeout: ["The provider took too long to respond. Retry or add manually.", "user"],
  provider_error: ["The provider could not complete this lookup. Retry or add manually.", "user"],
  invalid_metadata: ["The provider returned unusable metadata. You can add the title manually.", "never"],
  cancelled: ["The lookup was cancelled. You can retry or add manually.", "user"],
};
export function lookupFailure(code: FailureCode, delay?: unknown): LookupFailure {
  const safeCode = Object.hasOwn(failures, code) ? code : "provider_error";
  const [message, retry] = failures[safeCode];
  return { kind: "failure", code: safeCode, message, retry, retryAfterSeconds: retry === "after_delay" && Number.isInteger(delay) && typeof delay === "number" && delay >= 0 && delay <= 86400 ? delay : null, manualFallback: true };
}
export function providerIdentity(namespace: ProviderNamespace, value: unknown): ProviderIdentity | null {
  if (typeof value !== "string") return null;
  const valid = namespace === "youtube" ? /^[A-Za-z0-9_-]{11}$/.test(value) : namespace === "kinopoisk_unofficial" && /^[1-9][0-9]{0,18}$/.test(value);
  return valid ? { namespace, externalId: value } : null;
}
function text(value: unknown, max: number): string | null {
  if (typeof value !== "string" || /\p{Cc}/u.test(value)) return null;
  const trimmed = value.trim();
  return trimmed && [...trimmed].length <= max ? trimmed : null;
}
function contentType(namespace: ProviderNamespace, value: unknown): ContentType | null {
  return namespace === "youtube" ? value === "youtube" ? value : null : value === "movie" || value === "series" ? value : null;
}
function publicUrl(value: unknown): string | null {
  const safe = safeExternalUrl(value);
  if (!safe) return null;
  const url = new URL(safe);
  if ([...url.searchParams.keys()].some(key => /key|token|secret|auth|credential|password|signature/i.test(key)) || url.hash) return null;
  return safe;
}
function candidate(namespace: ProviderNamespace, raw: ItemProjection): Candidate | null {
  const identity = providerIdentity(namespace, raw.externalId);
  if (!identity) return null;
  const uncertain = new Set(Array.isArray(raw.uncertainFields) ? raw.uncertainFields : []);
  return { identity, title: uncertain.has("title") ? null : text(raw.title, 200), year: !uncertain.has("year") && typeof raw.year === "number" && Number.isInteger(raw.year) && raw.year >= 1 && raw.year <= 9999 ? raw.year : null, contentType: uncertain.has("contentType") ? null : contentType(namespace, raw.contentType), coverUrl: uncertain.has("coverUrl") ? null : publicUrl(raw.coverUrl) };
}
function item(namespace: ProviderNamespace, raw: ItemProjection, now: Date): LookupResult {
  const base = candidate(namespace, raw);
  if (!base) return lookupFailure("invalid_metadata");
  const issues: MetadataItem["issues"] = [];
  const uncertain = new Set(Array.isArray(raw.uncertainFields) ? raw.uncertainFields : []);
  const issue = (field: SuggestionField, reason: MetadataItem["issues"][number]["reason"]) => { issues.push({ field, reason }); };
  for (const field of ["title", "contentType"] as const) {
    if (uncertain.has(field)) { base[field] = null; issue(field, "uncertain"); }
    else if (!base[field]) issue(field, raw[field] == null ? "missing" : field === "contentType" ? "unsupported" : "invalid");
  }
  if (uncertain.has("year")) issue("year", "uncertain");
  else if (raw.year != null && !base.year) issue("year", "invalid");
  const episodic = base.contentType === "series" || base.contentType === "anime";
  const meaning = base.contentType ? episodic ? "typical_episode" : "full_item" : "unknown";
  const seconds = raw.duration?.seconds;
  const validDuration = !uncertain.has("duration") && raw.duration?.verified === true && raw.duration.meaning === meaning && meaning !== "unknown" && typeof seconds === "number" && Number.isInteger(seconds) && seconds > 0 && seconds <= 86400;
  if (!validDuration) issue("duration", uncertain.has("duration") ? "uncertain" : seconds == null ? "missing" : "invalid");
  const urls = { coverUrl: base.coverUrl, sourceUrl: publicUrl(raw.sourceUrl), watchUrl: publicUrl(raw.watchUrl) };
  for (const field of ["coverUrl", "sourceUrl", "watchUrl"] as const) {
    if (uncertain.has(field)) { urls[field] = null; issue(field, "uncertain"); }
    else if (raw[field] != null && raw[field] !== "" && !urls[field]) issue(field, "invalid");
  }
  let genres: string[] = [];
  if (uncertain.has("genres")) issue("genres", "uncertain");
  else if (raw.genres != null) {
    if (!Array.isArray(raw.genres) || raw.genres.length > 10) issue("genres", "invalid");
    else for (const value of raw.genres) {
      const genre = text(value, 40);
      if (!genre || genre.includes(",")) issue("genres", "invalid");
      else if (!genres.some(existing => existing.toLowerCase() === genre.toLowerCase())) genres.push(genre);
    }
  }
  const manualFields: MetadataItem["manualFields"] = [];
  if (!base.title) manualFields.push("title");
  if (!base.contentType) manualFields.push("contentType");
  if (!validDuration) manualFields.push("duration");
  const acquiredFields: SuggestionField[] = [];
  if (base.title) acquiredFields.push("title");
  if (base.year) acquiredFields.push("year");
  if (base.contentType) acquiredFields.push("contentType");
  if (validDuration) acquiredFields.push("duration");
  if (genres.length) acquiredFields.push("genres");
  for (const field of ["coverUrl", "sourceUrl", "watchUrl"] as const) if (urls[field]) acquiredFields.push(field);
  const refreshBy = new Date(now); refreshBy.setUTCDate(refreshBy.getUTCDate() + 30);
  return { kind: manualFields.length || issues.length ? "incomplete" : "available", item: { ...base, ...urls, genres,
    duration: { seconds: validDuration ? seconds as number : null, meaning }, issues, manualFields,
    requirements: ["review_metadata", "choose_moods", ...(episodic ? ["choose_numbering", "confirm_typical_episode_duration"] as const : [])],
    provenance: { provider: namespace, retrievedAt: now.toISOString(), acquiredFields, origin: "provider_suggestions", freshness: namespace === "youtube" ? { policy: "youtube_public_30_days", refreshBy: refreshBy.toISOString(), action: "refresh_or_delete" } : { policy: "provider_policy_unverified", refreshBy: null, action: "verify_policy_before_persistence" } },
  } };
}

/** Server orchestration boundary. Inject an adapter; this module performs no I/O or saves. */
export async function lookupMetadata(provider: MetadataProvider, query: LookupQuery, context: { signal?: AbortSignal; now?: () => Date } = {}): Promise<LookupResult> {
  try {
    if (provider.namespace !== "youtube" && provider.namespace !== "kinopoisk_unofficial") return lookupFailure("invalid_query");
    let safeQuery: LookupQuery;
    if (query.kind === "detail" && providerIdentity(provider.namespace, query.externalId)) safeQuery = { kind: "detail", externalId: query.externalId };
    else if (query.kind === "search" && text(query.text, 200)) safeQuery = { kind: "search", text: text(query.text, 200)! };
    else return lookupFailure("invalid_query");
    if (context.signal?.aborted) return lookupFailure("cancelled");
    const reply = await provider.lookup(safeQuery, { signal: context.signal });
    if (context.signal?.aborted) return lookupFailure("cancelled");
    if (reply.kind === "failure") return lookupFailure(reply.code, reply.retryAfterSeconds);
    if (reply.kind === "search" && safeQuery.kind === "search" && Array.isArray(reply.candidates)) {
      if (!reply.candidates.length) return { kind: "no_match", candidates: [], manualFallback: true };
      const candidates = reply.candidates.map(raw => candidate(provider.namespace, raw)).filter((value): value is Candidate => value !== null);
      return candidates.length ? { kind: "candidates", candidates, requiresSelection: true, omittedInvalidCandidates: candidates.length !== reply.candidates.length } : lookupFailure("invalid_metadata");
    }
    if (reply.kind !== "item" || safeQuery.kind !== "detail" || reply.item.externalId !== safeQuery.externalId) return lookupFailure("invalid_metadata");
    const now = context.now?.() ?? new Date();
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) return lookupFailure("provider_error");
    return item(provider.namespace, reply.item, now);
  } catch { return lookupFailure(context.signal?.aborted ? "cancelled" : "provider_error"); }
}
