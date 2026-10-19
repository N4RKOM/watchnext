import { randomBytes } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { requireTitleMember } from "../title-access";
import { authorizeRequest } from "../request-access";
import { AccessError, credentialHash } from "../sessions";
import { TitleFieldError, validateManualTitle, type ManualTitleInput } from "../title-validation";
import { saveTitle } from "../shared-save";
import { safeExternalUrl } from "../urls";
import { ensureFreshMetadata, metadataColumns, storedFields, type StoredField } from "./lifecycle";
import { lookupFailure, lookupMetadata } from "./lookup";
import { youtubeLookupQuery } from "./youtube-input";
import { youtubeBudget,kinopoiskBudget } from "./admission";
import { kinopoiskSearchText } from "./kinopoisk-input";
import type { Candidate, LookupResult, MetadataItem, MetadataProvider, ProviderNamespace,ProviderPage } from "./types";

export type Providers = Record<ProviderNamespace, MetadataProvider>;
type Chain={kind:"youtube_chain"|"kinopoisk_chain";text:string;visited:number};
type SearchPage={provider:ProviderNamespace;text:string;number:number;navigation:ProviderPage;chainHash:string;expires:string};
type Snapshot = { kind: "item"; item: MetadataItem } | { kind: "candidates"; candidates: Candidate[];page?:SearchPage } | Chain;
export type ReviewResult = LookupResult & { handle?: string;page?:{number:number;next?:string;previous?:string;limitReached:boolean} };
const sessionId = (db: DatabaseSync, request: Request) => authorizeRequest(db,request).ownerKey;
const hash = (value: string) => credentialHash(value);
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
export class ReviewLinkError extends Error { constructor(public field: "sourceUrl" | "coverUrl") { super("Use a complete HTTP or HTTPS link without credentials, or leave it blank."); } }
function authorized(db: DatabaseSync, request: Request, origin?: string) { return requireTitleMember(db, request, { mutation: true, configuredOrigin: origin }); }
function store(db: DatabaseSync, request: Request, payload: Snapshot, now: Date, origin?: string,deadline?:string) {
  const context = authorized(db, request, origin), handle = randomBytes(32).toString("base64url");
  const expires = deadline??new Date(now.getTime() + 10 * 60000).toISOString();
  if(expires<=now.toISOString())throw new AccessError();
  db.prepare("DELETE FROM metadata_reviews WHERE session_id=? AND handle_hash NOT IN (SELECT handle_hash FROM metadata_reviews WHERE session_id=? ORDER BY expires_at DESC LIMIT 19)").run(sessionId(db,request), sessionId(db,request));
  db.prepare("INSERT INTO metadata_reviews(handle_hash,group_id,member_id,session_id,expires_at,payload) VALUES (?,?,?,?,?,?)").run(hash(handle), context.groupId, context.activeMemberId!, sessionId(db,request), expires, JSON.stringify(payload));
  return handle;
}
function snapshot(db: DatabaseSync, request: Request, handle: unknown, now: Date, origin?: string): Snapshot {
  const context = authorized(db, request, origin);
  ensureFreshMetadata(db, now);
  if (typeof handle !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(handle)) throw new AccessError();
  const row = db.prepare("SELECT payload FROM metadata_reviews WHERE handle_hash=? AND group_id=? AND member_id=? AND session_id=? AND expires_at>?")
    .get(hash(handle), context.groupId, context.activeMemberId!, sessionId(db,request), now.toISOString());
  if (!row) throw new AccessError();
  const value=JSON.parse(row.payload as string) as Snapshot;
  if(value.kind==="candidates"&&value.page)readChain(db,request,value.page.chainHash,now,origin,value.page.provider);
  return value;
}
function readChain(db:DatabaseSync,request:Request,chainHash:string,now:Date,origin?:string,provider?:ProviderNamespace){
  const current=authorized(db,request,origin),row=db.prepare("SELECT payload FROM metadata_reviews WHERE handle_hash=? AND group_id=? AND member_id=? AND session_id=? AND expires_at>?").get(chainHash,current.groupId,current.activeMemberId!,sessionId(db,request),now.toISOString());
  if(!row)throw new AccessError();const chain=JSON.parse(row.payload as string) as Snapshot;if(chain.kind!=="youtube_chain"&&chain.kind!=="kinopoisk_chain")throw new AccessError();if(provider&&(chain.kind==="youtube_chain")!==(provider==="youtube"))throw new AccessError();return chain;
}
function takeLookup(provider:ProviderNamespace,current:ReturnType<typeof authorized>,now:Date){try{(provider==="youtube"?youtubeBudget:kinopoiskBudget).take(current.ownerKey,now.getTime());return null;}catch{return lookupFailure("rate_limited",900);}}
function pageResult(db:DatabaseSync,request:Request,result:LookupResult,page:SearchPage,now:Date,origin?:string):ReviewResult{
  if(result.kind!=="candidates"&&result.kind!=="no_match")return result;
  const chain=readChain(db,request,page.chainHash,now,origin,page.provider),limitReached=chain.visited>=5;
  const candidates=result.candidates.map(candidate=>candidate.identity.namespace!=="kinopoisk_unofficial"||!candidate.provenance?candidate:{...candidate,provenance:{...candidate.provenance,freshness:{policy:"academic_local_snapshot_30_days",refreshBy:new Date(new Date(candidate.provenance.retrievedAt).getTime()+30*86400000).toISOString(),action:"refresh_or_delete"}}});
  const handle=store(db,request,{kind:"candidates",candidates,page},now,origin,page.expires);
  const projected:LookupResult=result.kind==="candidates"?{...result,candidates}:result;
  return {...projected,handle,page:{number:page.number,limitReached,...(!limitReached&&page.navigation.next?{next:handle}:{}),...(!limitReached&&page.number>1&&page.navigation.previous?{previous:handle}:{})}};
}
function sameContext(db: DatabaseSync, request: Request, before: ReturnType<typeof authorized>, origin?: string) {
  const after = authorized(db, request, origin);
  if (before.ownerKey !== after.ownerKey) throw new AccessError();
}
function projectPolicy(item: MetadataItem): MetadataItem {
  if (item.identity.namespace !== "kinopoisk_unofficial") return item;
  return { ...item, provenance: { ...item.provenance, freshness: { policy: "academic_local_snapshot_30_days", refreshBy: new Date(new Date(item.provenance.retrievedAt).getTime() + 30 * 86400000).toISOString(), action: "refresh_or_delete" } } };
}
function resultWithReview(db: DatabaseSync, request: Request, result: LookupResult, now: Date, origin?: string): ReviewResult {
  if (result.kind === "available" || result.kind === "incomplete") { const item = projectPolicy(result.item); return { ...result, item, handle: store(db, request, { kind: "item", item }, now, origin) }; }
  if (result.kind === "candidates") return { ...result, handle: store(db, request, { kind: "candidates", candidates: result.candidates }, now, origin) };
  return result;
}
/** No save occurs here. Provider identity is established only by server adapters. */
export async function beginReview(db: DatabaseSync, request: Request, source: unknown, query: unknown, providers: Providers, origin?: string, now = () => new Date()): Promise<ReviewResult> {
  const before = authorized(db, request, origin); ensureFreshMetadata(db, now());
  if (source !== "youtube" && source !== "kinopoisk_unofficial") return lookupFailure("invalid_query");
  const text=source==="kinopoisk_unofficial"?kinopoiskSearchText(query):null;
  const parsed=source==="youtube"?youtubeLookupQuery(query):text?{kind:"search" as const,text}:null;
  if(!parsed)return lookupFailure("invalid_query");
  const denied=takeLookup(source,before,now());if(denied)return denied;
  const kind=source==="youtube"?"youtube_chain":"kinopoisk_chain";
  db.prepare("DELETE FROM metadata_reviews WHERE session_id=? AND (json_extract(payload,'$.kind')=? OR json_extract(payload,'$.page.provider')=?)").run(sessionId(db,request),kind,source);
  if(parsed.kind==="search"){
    // Superseding a query physically drops its old page data and invalidates pending work.
    const expires=new Date(now().getTime()+600000).toISOString(),anchor=store(db,request,{kind,text:parsed.text,visited:1},now(),origin,expires),chainHash=hash(anchor);
    let navigation:ProviderPage={};const result=await lookupMetadata(providers[source],parsed,{now,signal:request.signal,onPage:value=>{navigation=value;}});
    sameContext(db,request,before,origin);readChain(db,request,chainHash,now(),origin,source);
    if(result.kind!=="candidates"&&result.kind!=="no_match"){db.prepare("DELETE FROM metadata_reviews WHERE handle_hash=?").run(chainHash);return result;}
    return pageResult(db,request,result,{provider:source,text:parsed.text,number:1,navigation,chainHash,expires},now(),origin);
  }
  const result = await lookupMetadata(providers[source], parsed, { now, signal: request.signal });
  sameContext(db, request, before, origin);
  return resultWithReview(db, request, result, now(), origin);
}
export async function selectReviewCandidate(db: DatabaseSync, request: Request, handle: unknown, id: unknown, providers: Providers, origin?: string, now = () => new Date()):Promise<ReviewResult> {
  const before = authorized(db, request, origin), current = snapshot(db, request, handle, now(), origin);
  if (current.kind !== "candidates")throw new AccessError();
  const selected=current.candidates.find(candidate=>candidate.identity.externalId===id);
  if(!selected)throw new AccessError();const namespace=selected.identity.namespace;
  const denied=takeLookup(namespace,before,now());if(denied)return denied;
  const result = await lookupMetadata(providers[namespace], { kind: "detail", externalId: id as string }, { now, signal: request.signal });
  sameContext(db, request, before, origin);
  snapshot(db, request, handle, now(), origin);
  return resultWithReview(db, request, result, now(), origin);
}
/** Only opaque current-review handles and explicit direction reach this service. */
export async function pageReview(db:DatabaseSync,request:Request,handle:unknown,direction:unknown,providers:Providers,origin?:string,now=()=>new Date()):Promise<ReviewResult>{
  const before=authorized(db,request,origin),current=snapshot(db,request,handle,now(),origin);
  if(current.kind!=="candidates"||!current.page||(direction!=="next"&&direction!=="previous"))throw new AccessError();
  const page=current.page,token=page.navigation[direction];if(!token||(direction==="previous"&&page.number<=1))throw new AccessError();
  const denied=takeLookup(page.provider,before,now());if(denied)return denied;
  db.exec("BEGIN IMMEDIATE");
  try{const chain=readChain(db,request,page.chainHash,now(),origin,page.provider);if(chain.visited>=5)throw new AccessError();db.prepare("UPDATE metadata_reviews SET payload=? WHERE handle_hash=?").run(JSON.stringify({...chain,visited:chain.visited+1}),page.chainHash);db.exec("COMMIT");}catch(error){db.exec("ROLLBACK");throw error;}
  let navigation:ProviderPage={};const result=await lookupMetadata(providers[page.provider],{kind:"search",text:page.text,pageToken:token},{now,signal:request.signal,onPage:value=>{navigation=value;}});
  sameContext(db,request,before,origin);snapshot(db,request,handle,now(),origin);
  return pageResult(db,request,result,{...page,number:page.number+(direction==="next"?1:-1),navigation},now(),origin);
}
function values(item: MetadataItem): Record<StoredField, unknown> {
  return { title: item.title, contentType: item.contentType, duration: item.duration.seconds, genres: item.genres, sourceUrl: item.sourceUrl, watchUrl: item.watchUrl, coverUrl: item.coverUrl };
}
function reviewedValues(fields: ManualTitleInput, source: unknown, cover: unknown): Record<StoredField, unknown> {
  const value = validateManualTitle(fields);
  const optional = (input: unknown, field: "sourceUrl" | "coverUrl") => {
    if (input === "" || input == null) return null;
    const url = safeExternalUrl(input); if (!url) throw new ReviewLinkError(field); return url;
  };
  return { title: value.title, contentType: value.contentType, duration: value.durationSeconds, genres: [...value.genres.values()], watchUrl: value.watchUrl, sourceUrl: optional(source, "sourceUrl"), coverUrl: optional(cover, "coverUrl") };
}
export function saveReview(db: DatabaseSync, request: Request, handle: unknown, fields: ManualTitleInput & { typicalDurationConfirmed?: unknown }, source: unknown, cover: unknown, confirmationId?: unknown, origin?: string, now = () => new Date()) {
  const current = snapshot(db, request, handle, now(), origin);
  if (current.kind !== "item") throw new AccessError();
  const item = current.item;
  if (item.provenance.freshness.refreshBy && item.provenance.freshness.refreshBy <= now().toISOString()) throw new AccessError();
  const original = values(item), reviewed = reviewedValues(fields, source, cover);
  const episodic = reviewed.contentType === "series" || reviewed.contentType === "anime";
  if (episodic && fields.typicalDurationConfirmed !== "yes") throw new TitleFieldError("minutes", "Confirm that this is a typical episode duration before saving.");
  const expires = item.provenance.freshness.refreshBy ?? new Date(new Date(item.provenance.retrievedAt).getTime() + 30 * 86400000).toISOString();
  return saveTitle(db, request, { kind: "provider", fields, provider: { ...item.identity, sourceUrl: reviewed.sourceUrl, coverUrl: reviewed.coverUrl }, ...(confirmationId === undefined ? {} : { confirmationId }) }, origin, { beforeCommit(result) {
    snapshot(db, request, handle, now(), origin);
    if (result.kind === "created") for (const field of storedFields) {
      const acquired = item.provenance.acquiredFields.includes(field === "duration" ? "duration" : field);
      const providerOwned = acquired && equal(original[field], reviewed[field]) && !(field === "duration" && (episodic ? "typical_episode" : "full_item") !== item.duration.meaning);
      db.prepare("INSERT INTO metadata_fields(title_id,field,origin,retrieved_at,expires_at) VALUES (?,?,?,?,?)")
        .run(result.id, field, providerOwned ? "provider" : "user", providerOwned ? item.provenance.retrievedAt : null, providerOwned ? expires : null);
    }
    if (["created", "existing", "restored"].includes(result.kind)) db.prepare("DELETE FROM metadata_reviews WHERE handle_hash=?").run(hash(handle as string));
  } });
}
/** Only still-provider-owned fields are refreshed; concurrent manual corrections win. */
export async function refreshTitleMetadata(db: DatabaseSync, request: Request, id: string, providers: Providers, origin?: string, now = () => new Date()): Promise<LookupResult> {
  const before = authorized(db, request, origin); authorizeRequest(db, request, { kind: "title", id }, { mutation: true, configuredOrigin: origin }); ensureFreshMetadata(db, now());
  const contributor = () => {
    if (before.mode === "account" && !db.prepare("SELECT 1 FROM contributors c JOIN titles t ON t.id=c.title_id WHERE c.title_id=? AND c.group_id=? AND c.member_id=? AND t.archived=0").get(id,before.groupId,before.activeMemberId!)) throw new AccessError();
  };
  contributor();
  const row = db.prepare("SELECT provider_namespace,provider_id FROM titles WHERE id=? AND group_id=?").get(id, before.groupId)!;
  if (row.provider_namespace !== "youtube" && row.provider_namespace !== "kinopoisk_unofficial") return lookupFailure("invalid_query");
  const denied=takeLookup(row.provider_namespace,before,now());if(denied)return denied;
  const result = await lookupMetadata(providers[row.provider_namespace], { kind: "detail", externalId: row.provider_id as string }, { now, signal: request.signal });
  sameContext(db, request, before, origin); authorizeRequest(db, request, { kind: "title", id }, { mutation: true, configuredOrigin: origin });
  contributor();
  if (result.kind !== "available" && result.kind !== "incomplete") { ensureFreshMetadata(db, now()); return result; }
  const item = projectPolicy(result.item), fresh = values(item), expires = item.provenance.freshness.refreshBy ?? new Date(new Date(item.provenance.retrievedAt).getTime() + 30 * 86400000).toISOString();
  db.exec("BEGIN IMMEDIATE");
  try {
    authorized(db,request,origin); contributor();
    for (const field of storedFields) {
      if (!item.provenance.acquiredFields.includes(field) || !db.prepare("SELECT 1 FROM metadata_fields WHERE title_id=? AND field=? AND origin='provider'").get(id, field)) continue;
      if (field === "genres") {
        db.prepare("DELETE FROM title_genres WHERE title_id=?").run(id);
        for (const label of item.genres) db.prepare("INSERT INTO title_genres(title_id,genre_key,label) VALUES (?,?,?)").run(id, label.toLowerCase(), label);
      } else {
        db.prepare(`UPDATE titles SET ${metadataColumns[field]}=?${field === "title" ? ",title_key=?" : ""} WHERE id=?`)
          .run(...(field === "title" ? [fresh[field] as string, (fresh[field] as string).normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase(), id] : [fresh[field] as string | number, id]));
      }
      db.prepare("UPDATE metadata_fields SET retrieved_at=?,expires_at=?,cleared=0 WHERE title_id=? AND field=? AND origin='provider'").run(item.provenance.retrievedAt, expires, id, field);
    }
    db.prepare("UPDATE titles SET metadata_unavailable=CASE WHEN title IS NULL OR content_type IS NULL OR duration_seconds IS NULL THEN 1 ELSE 0 END WHERE id=?").run(id);
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
  ensureFreshMetadata(db, now()); return { ...result, item };
}
