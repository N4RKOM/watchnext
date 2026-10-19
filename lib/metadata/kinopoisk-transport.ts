import { clearTimeout, setTimeout } from "node:timers";
import { kinopoiskSearchText, kinopoiskUnofficialId } from "./kinopoisk-input";
import type { FailureCode, ItemProjection, LookupQuery, MetadataProvider, ProviderReply } from "./types";
import { kinopoiskPoster } from "./kinopoisk-poster";
import { kinopoiskPool,LookupAdmissionError,type LookupPool } from "./admission";

type Options = { apiKey?: string; transport?: typeof fetch; timeoutMs?: number;pool?:LookupPool };
type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue => value !== null && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
const failure = (code: FailureCode, retryAfterSeconds?: unknown): ProviderReply => ({ kind: "failure", code, retryAfterSeconds });
function responseId(value: unknown): string | null {
  return typeof value === "number" && Number.isSafeInteger(value) ? kinopoiskUnofficialId(String(value)) : null;
}
function validName(value: unknown): value is string {
  return typeof value === "string" && !/\p{Cc}/u.test(value) && value.trim().length > 0 && [...value.trim()].length <= 200;
}
function project(raw: RecordValue,detail=false): ItemProjection {
  const title = [raw.nameRu, raw.nameOriginal, raw.nameEn].find(validName)?.trim() ?? null;
  const minutes=raw.filmLength,usable=detail&&raw.type==="FILM"&&typeof minutes==="number"&&Number.isInteger(minutes)&&minutes>0&&minutes<=1440;
  const posters=detail?[raw.posterUrl,raw.posterUrlPreview]:[raw.posterUrlPreview,raw.posterUrl];
  return { externalId: responseId(raw.kinopoiskId), title, year: raw.year,
    contentType: raw.type === "FILM" ? "movie" : raw.type === "TV_SERIES" || raw.type === "MINI_SERIES" ? "series" : null,
    genres: Array.isArray(raw.genres) ? raw.genres.map(genre => record(genre).genre) : raw.genres,
    sourceUrl: raw.webUrl, watchUrl: null, coverUrl: posters.map(kinopoiskPoster).find(value=>value!==null)??null,
    // Explicit editable app convention, not provider-confirmed units.
    duration:usable?{seconds:minutes*60,meaning:"full_item",interpretation:"app_minutes_to_seconds"}:{seconds:null,meaning:"unknown",verified:false},uncertainFields:!usable&&raw.filmLength!=null?["duration"]:[],
  };
}
function retryAfter(response: Response): number | null {
  const raw = response.headers.get("retry-after");
  const seconds = raw && /^\d+$/.test(raw) ? Number(raw) : NaN;
  return Number.isSafeInteger(seconds) && seconds >= 0 && seconds <= 86400 ? seconds : null;
}
class InvalidBody extends Error{}
async function boundedBody(response:Response,signal:AbortSignal){
  const length=response.headers.get("content-length");if(length&&/^\d+$/.test(length)&&Number(length)>262144){void response.body?.cancel();throw new InvalidBody();}
  if(!response.body)throw new InvalidBody();const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
  const abort=()=>{void reader.cancel().catch(()=>{});};signal.addEventListener("abort",abort,{once:true});
  try{while(true){signal.throwIfAborted();const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>262144){await reader.cancel();throw new InvalidBody();}chunks.push(part.value);}signal.throwIfAborted();try{return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;}catch{throw new InvalidBody();}}
  finally{signal.removeEventListener("abort",abort);reader.releaseLock();}
}
async function projection(response: Response, query: LookupQuery,signal:AbortSignal): Promise<ProviderReply> {
  if (!response.ok) {
    // Status is sufficient; discard rather than parse or retain provider error bodies.
    try { await response.body?.cancel(); } catch { /* Status mapping remains safe. */ }
    const statuses: Record<number, FailureCode> = { 400: "invalid_query", 401: "not_configured", 402: "quota_exhausted", 403: "not_configured", 404: "not_found_or_inaccessible", 429: "rate_limited" };
    return failure(statuses[response.status] ?? "provider_error", response.status === 429 ? retryAfter(response) : null);
  }
  let body: unknown;
  try { body = await boundedBody(response,signal); } catch { if(signal.aborted)throw new Error("Interrupted");return failure("invalid_metadata"); }
  const raw = record(body);
  if (query.kind === "detail") {
    if (responseId(raw.kinopoiskId) !== query.externalId) return failure("invalid_metadata");
    return { kind: "item", item: project(raw,true) };
  }
  if (!Array.isArray(raw.items) || raw.items.length > 20) return failure("invalid_metadata");
  const seen = new Set<string>();
  const candidates: ItemProjection[] = [];
  for (const value of raw.items) {
    const item = project(record(value)), id = item.externalId;
    if (typeof id === "string") { if (seen.has(id)) continue; seen.add(id); }
    candidates.push(item);
  }
  const page=query.kind==="search"?Number(query.pageToken??"1"):1,total=raw.totalPages;
  if((total===undefined&&page>1)||(total===0&&raw.items.length>0))return failure("invalid_metadata");
  if(total!==undefined&&(!Number.isInteger(total)||typeof total!=="number"||total<0||total>2147483647||page>Math.max(1,Math.min(total,20))))return failure("invalid_metadata");
  const last=typeof total==="number"?Math.min(total,20):page;
  return { kind: "search", candidates,navigation:{...(page<last?{next:String(page+1)}:{}),...(page>1&&typeof total==="number"?{previous:String(page-1)}:{})} };
}

/** Node-only third-party transport. Application imports the configured server-only entry. */
export function kinopoiskUnofficialProvider(options: Options): MetadataProvider {
  const timeoutMs = options.timeoutMs ?? 10000;
  return { namespace: "kinopoisk_unofficial", async lookup(query, { signal }) {
    const id = query.kind === "detail" ? kinopoiskUnofficialId(query.externalId) : null;
    const text = query.kind === "search" ? kinopoiskSearchText(query.text) : null;
    if (!id && !text) return failure("invalid_query");
    const page=query.kind==="search"?query.pageToken??"1":"1";
    if(!/^(?:[1-9]|1[0-9]|20)$/.test(page))return failure("invalid_query");
    if (signal?.aborted) return failure("cancelled");
    const key = options.apiKey?.trim();
    if (!key || /[\p{Cc}\s]/u.test(key) || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) return failure("not_configured");
    let release:()=>void;try{release=await(options.pool??kinopoiskPool).acquire(signal);}catch(error){return failure(error instanceof LookupAdmissionError?error.code:"provider_error",30);}
    const controller = new AbortController();
    let timedOut = false;
    let rejectAbort: () => void = () => {};
    const aborted = new Promise<never>((_resolve, reject) => { rejectAbort = () => reject(new Error("Lookup interrupted")); });
    const onAbort = () => { controller.abort(); rejectAbort(); };
    signal?.addEventListener("abort", onAbort, { once: true });
    const timer = setTimeout(() => { timedOut = true; onAbort(); }, timeoutMs);
    try {
      if(signal?.aborted)onAbort();
      const safeQuery: LookupQuery = id ? { kind: "detail", externalId: id } : { kind: "search", text: text!,pageToken:page };
      const url = new URL(`https://kinopoiskapiunofficial.tech/api/v2.2/films${id ? `/${id}` : ""}`);
      if (text) { url.searchParams.set("keyword", text); url.searchParams.set("page", page); }
      const work = (async () => {
        controller.signal.throwIfAborted();const response = await (options.transport ?? fetch)(url, { method: "GET", headers: { "X-API-KEY": key, Accept: "application/json" }, signal: controller.signal, redirect: "error", cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer" });
        const result = await projection(response, safeQuery,controller.signal);
        return JSON.stringify(result).includes(key) ? failure("invalid_metadata") : result;
      })();
      return await Promise.race([work, aborted]);
    } catch { return failure(signal?.aborted ? "cancelled" : timedOut ? "timeout" : "network_error"); }
    finally { clearTimeout(timer); signal?.removeEventListener("abort", onAbort);release(); }
  } };
}
