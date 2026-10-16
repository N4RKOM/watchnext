import { clearTimeout, setTimeout } from "node:timers";
import { providerIdentity } from "./lookup";
import { youtubeDurationSeconds } from "./youtube-input";
import type { FailureCode, MetadataProvider, ProviderReply } from "./types";

type Options = { apiKey?: string; transport?: typeof fetch; timeoutMs?: number };
type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue => value !== null && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
const failure = (code: FailureCode, retryAfterSeconds?: unknown): ProviderReply => ({ kind: "failure", code, retryAfterSeconds });

function retryAfter(response: Response): number | null {
  const value = response.headers.get("retry-after");
  if (!value || !/^\d+$/.test(value)) return null;
  const seconds = Number(value);
  return Number.isSafeInteger(seconds) && seconds <= 86400 ? seconds : null;
}
async function responseProjection(response: Response, id: string): Promise<ProviderReply> {
  let body: unknown;
  try { body = await response.json(); } catch { body = null; }
  const envelope = record(body);
  if (!response.ok) {
    const errors = record(envelope.error).errors;
    const reasons = Array.isArray(errors) ? errors.map(error => record(error).reason) : [];
    if (response.status === 429 || (response.status === 403 && reasons.some(reason => reason === "rateLimitExceeded" || reason === "userRateLimitExceeded"))) return failure("rate_limited", retryAfter(response));
    if (response.status === 403 && reasons.some(reason => reason === "quotaExceeded" || reason === "dailyLimitExceeded")) return failure("quota_exhausted");
    if (response.status === 404) return failure("not_found_or_inaccessible");
    if ([400, 401, 403].includes(response.status)) return failure("not_configured");
    return failure("provider_error");
  }
  if (!Array.isArray(envelope.items)) return failure("invalid_metadata");
  if (!envelope.items.length) return failure("not_found_or_inaccessible");
  if (envelope.items.length !== 1) return failure("invalid_metadata");
  const video = record(envelope.items[0]);
  if (video.id !== id) return failure("invalid_metadata");
  const status = record(video.status);
  if (status.privacyStatus === "private" || ["deleted", "failed", "rejected"].includes(String(status.uploadStatus))) return failure("not_found_or_inaccessible");
  const snippet = record(video.snippet), details = record(video.contentDetails), live = record(video.liveStreamingDetails);
  const hasLiveDetails = video.liveStreamingDetails !== undefined;
  const completedLive = typeof live.actualEndTime === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(live.actualEndTime) && Number.isFinite(Date.parse(live.actualEndTime));
  const verified = snippet.liveBroadcastContent === "none" && (!hasLiveDetails || completedLive);
  const seconds = youtubeDurationSeconds(details.duration);
  const thumbnails = record(snippet.thumbnails);
  const cover = ["maxres", "standard", "high", "medium", "default"].map(size => record(thumbnails[size]).url).find(value => typeof value === "string");
  const canonical = `https://www.youtube.com/watch?v=${id}`;
  return { kind: "item", item: { externalId: id, title: snippet.title, contentType: "youtube", duration: { seconds, meaning: "full_item", verified: verified && seconds !== null }, coverUrl: cover, sourceUrl: canonical, watchUrl: canonical, genres: [], uncertainFields: verified ? [] : ["duration"] } };
}

/** Node-only implementation; application imports the server-only configured entry. */
export function youtubeProvider(options: Options): MetadataProvider {
  const timeoutMs = options.timeoutMs === undefined ? 10000 : options.timeoutMs;
  return { namespace: "youtube", async lookup(query, { signal }) {
    if (query.kind !== "detail" || !providerIdentity("youtube", query.externalId)) return failure("invalid_query");
    if (signal?.aborted) return failure("cancelled");
    const key = options.apiKey?.trim();
    if (!key || /[\p{Cc}\s]/u.test(key)) return failure("not_configured");
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) return failure("not_configured");
    const controller = new AbortController();
    let timedOut = false;
    let rejectAbort: () => void = () => {};
    const aborted = new Promise<never>((_resolve, reject) => { rejectAbort = () => reject(new Error("Lookup interrupted")); });
    const onAbort = () => { controller.abort(); rejectAbort(); };
    signal?.addEventListener("abort", onAbort, { once: true });
    const timer = setTimeout(() => { timedOut = true; onAbort(); }, timeoutMs);
    try {
      const url = new URL("https://www.googleapis.com/youtube/v3/videos");
      url.searchParams.set("part", "snippet,contentDetails,status,liveStreamingDetails");
      url.searchParams.set("id", query.externalId);
      const work = (async () => {
        const response = await (options.transport ?? fetch)(url, { method: "GET", headers: { "X-Goog-Api-Key": key, Accept: "application/json" }, signal: controller.signal, redirect: "error", cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer" });
        const projection = await responseProjection(response, query.externalId);
        // A provider/proxy must not echo even the configured key into selected fields.
        return JSON.stringify(projection).includes(key) ? failure("invalid_metadata") : projection;
      })();
      return await Promise.race([work, aborted]);
    } catch { return failure(signal?.aborted ? "cancelled" : timedOut ? "timeout" : "network_error"); }
    finally { clearTimeout(timer); signal?.removeEventListener("abort", onAbort); }
  } };
}
