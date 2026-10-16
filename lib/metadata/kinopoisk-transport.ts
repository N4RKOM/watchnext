import { clearTimeout, setTimeout } from "node:timers";
import { kinopoiskSearchText, kinopoiskUnofficialId } from "./kinopoisk-input";
import type { FailureCode, ItemProjection, LookupQuery, MetadataProvider, ProviderReply } from "./types";

type Options = { apiKey?: string; transport?: typeof fetch; timeoutMs?: number };
type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue => value !== null && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
const failure = (code: FailureCode, retryAfterSeconds?: unknown): ProviderReply => ({ kind: "failure", code, retryAfterSeconds });
function responseId(value: unknown): string | null {
  return typeof value === "number" && Number.isSafeInteger(value) ? kinopoiskUnofficialId(String(value)) : null;
}
function validName(value: unknown): value is string {
  return typeof value === "string" && !/\p{Cc}/u.test(value) && value.trim().length > 0 && [...value.trim()].length <= 200;
}
function project(raw: RecordValue): ItemProjection {
  const title = [raw.nameRu, raw.nameOriginal, raw.nameEn].find(validName)?.trim() ?? null;
  return { externalId: responseId(raw.kinopoiskId), title, year: raw.year,
    contentType: raw.type === "FILM" ? "movie" : raw.type === "TV_SERIES" || raw.type === "MINI_SERIES" ? "series" : null,
    genres: Array.isArray(raw.genres) ? raw.genres.map(genre => record(genre).genre) : raw.genres,
    sourceUrl: raw.webUrl, watchUrl: null, coverUrl: null,
    // Units and episodic meaning are unverified; never convert filmLength to seconds.
    duration: { seconds: null, meaning: "unknown", verified: false }, uncertainFields: raw.filmLength == null ? [] : ["duration"],
  };
}
function retryAfter(response: Response): number | null {
  const raw = response.headers.get("retry-after");
  const seconds = raw && /^\d+$/.test(raw) ? Number(raw) : NaN;
  return Number.isSafeInteger(seconds) && seconds >= 0 && seconds <= 86400 ? seconds : null;
}
async function projection(response: Response, query: LookupQuery): Promise<ProviderReply> {
  if (!response.ok) {
    // Status is sufficient; discard rather than parse or retain provider error bodies.
    try { await response.body?.cancel(); } catch { /* Status mapping remains safe. */ }
    const statuses: Record<number, FailureCode> = { 400: "invalid_query", 401: "not_configured", 402: "quota_exhausted", 403: "not_configured", 404: "not_found_or_inaccessible", 429: "rate_limited" };
    return failure(statuses[response.status] ?? "provider_error", response.status === 429 ? retryAfter(response) : null);
  }
  let body: unknown;
  try { body = await response.json(); } catch { return failure("invalid_metadata"); }
  const raw = record(body);
  if (query.kind === "detail") {
    if (responseId(raw.kinopoiskId) !== query.externalId) return failure("invalid_metadata");
    return { kind: "item", item: project(raw) };
  }
  if (!Array.isArray(raw.items) || raw.items.length > 20) return failure("invalid_metadata");
  const seen = new Set<string>();
  const candidates: ItemProjection[] = [];
  for (const value of raw.items) {
    const item = project(record(value)), id = item.externalId;
    if (typeof id === "string") { if (seen.has(id)) continue; seen.add(id); }
    candidates.push(item);
  }
  return { kind: "search", candidates };
}

/** Node-only third-party transport. Application imports the configured server-only entry. */
export function kinopoiskUnofficialProvider(options: Options): MetadataProvider {
  const timeoutMs = options.timeoutMs ?? 10000;
  return { namespace: "kinopoisk_unofficial", async lookup(query, { signal }) {
    const id = query.kind === "detail" ? kinopoiskUnofficialId(query.externalId) : null;
    const text = query.kind === "search" ? kinopoiskSearchText(query.text) : null;
    if (!id && !text) return failure("invalid_query");
    if (signal?.aborted) return failure("cancelled");
    const key = options.apiKey?.trim();
    if (!key || /[\p{Cc}\s]/u.test(key) || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) return failure("not_configured");
    const controller = new AbortController();
    let timedOut = false;
    let rejectAbort: () => void = () => {};
    const aborted = new Promise<never>((_resolve, reject) => { rejectAbort = () => reject(new Error("Lookup interrupted")); });
    const onAbort = () => { controller.abort(); rejectAbort(); };
    signal?.addEventListener("abort", onAbort, { once: true });
    const timer = setTimeout(() => { timedOut = true; onAbort(); }, timeoutMs);
    try {
      const safeQuery: LookupQuery = id ? { kind: "detail", externalId: id } : { kind: "search", text: text! };
      const url = new URL(`https://kinopoiskapiunofficial.tech/api/v2.2/films${id ? `/${id}` : ""}`);
      if (text) { url.searchParams.set("keyword", text); url.searchParams.set("page", "1"); }
      const work = (async () => {
        const response = await (options.transport ?? fetch)(url, { method: "GET", headers: { "X-API-KEY": key, Accept: "application/json" }, signal: controller.signal, redirect: "error", cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer" });
        const result = await projection(response, safeQuery);
        return JSON.stringify(result).includes(key) ? failure("invalid_metadata") : result;
      })();
      return await Promise.race([work, aborted]);
    } catch { return failure(signal?.aborted ? "cancelled" : timedOut ? "timeout" : "network_error"); }
    finally { clearTimeout(timer); signal?.removeEventListener("abort", onAbort); }
  } };
}
