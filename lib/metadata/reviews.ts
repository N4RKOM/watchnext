import { randomBytes } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { requireTitleMember } from "../title-access";
import { authorizeRequest } from "../request-access";
import { AccessError, credentialHash, readSessionCookie } from "../sessions";
import { validateManualTitle, type ManualTitleInput } from "../title-validation";
import { saveTitle } from "../shared-save";
import { safeExternalUrl } from "../urls";
import { ensureFreshMetadata, metadataColumns, storedFields, type StoredField } from "./lifecycle";
import { lookupFailure, lookupMetadata } from "./lookup";
import { youtubeVideoId } from "./youtube-input";
import type { Candidate, LookupResult, MetadataItem, MetadataProvider, ProviderNamespace } from "./types";

export type Providers = Record<ProviderNamespace, MetadataProvider>;
type Snapshot = { kind: "item"; item: MetadataItem } | { kind: "candidates"; candidates: Candidate[] };
export type ReviewResult = LookupResult & { handle?: string };
const sessionId = (request: Request) => credentialHash(readSessionCookie(request.headers.get("cookie")) ?? "");
const hash = (value: string) => credentialHash(value);
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
export class ReviewLinkError extends Error { constructor(public field: "sourceUrl" | "coverUrl") { super("Use a complete HTTP or HTTPS link without credentials, or leave it blank."); } }
function authorized(db: DatabaseSync, request: Request, origin?: string) { return requireTitleMember(db, request, { mutation: true, configuredOrigin: origin }); }
function store(db: DatabaseSync, request: Request, payload: Snapshot, now: Date, origin?: string) {
  const context = authorized(db, request, origin), handle = randomBytes(32).toString("base64url");
  const expires = new Date(now.getTime() + 10 * 60000).toISOString();
  db.prepare("DELETE FROM metadata_reviews WHERE session_id=? AND handle_hash NOT IN (SELECT handle_hash FROM metadata_reviews WHERE session_id=? ORDER BY expires_at DESC LIMIT 19)").run(sessionId(request), sessionId(request));
  db.prepare("INSERT INTO metadata_reviews(handle_hash,group_id,member_id,session_id,expires_at,payload) VALUES (?,?,?,?,?,?)").run(hash(handle), context.groupId, context.activeMemberId!, sessionId(request), expires, JSON.stringify(payload));
  return handle;
}
function snapshot(db: DatabaseSync, request: Request, handle: unknown, now: Date, origin?: string): Snapshot {
  const context = authorized(db, request, origin);
  ensureFreshMetadata(db, now);
  if (typeof handle !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(handle)) throw new AccessError();
  const row = db.prepare("SELECT payload FROM metadata_reviews WHERE handle_hash=? AND group_id=? AND member_id=? AND session_id=? AND expires_at>?")
    .get(hash(handle), context.groupId, context.activeMemberId!, sessionId(request), now.toISOString());
  if (!row) throw new AccessError();
  return JSON.parse(row.payload as string) as Snapshot;
}
function sameContext(db: DatabaseSync, request: Request, before: ReturnType<typeof authorized>, origin?: string) {
  const after = authorized(db, request, origin);
  if (before.groupId !== after.groupId || before.activeMemberId !== after.activeMemberId) throw new AccessError();
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
  const id = source === "youtube" ? youtubeVideoId(query) : null;
  if (source === "youtube" && !id) return lookupFailure("invalid_query");
  const result = await lookupMetadata(providers[source], source === "youtube" ? { kind: "detail", externalId: id! } : { kind: "search", text: query as string }, { now, signal: request.signal });
  sameContext(db, request, before, origin);
  return resultWithReview(db, request, result, now(), origin);
}
export async function selectReviewCandidate(db: DatabaseSync, request: Request, handle: unknown, id: unknown, providers: Providers, origin?: string, now = () => new Date()) {
  const before = authorized(db, request, origin), current = snapshot(db, request, handle, now(), origin);
  if (current.kind !== "candidates" || !current.candidates.some(candidate => candidate.identity.namespace === "kinopoisk_unofficial" && candidate.identity.externalId === id)) throw new AccessError();
  const result = await lookupMetadata(providers.kinopoisk_unofficial, { kind: "detail", externalId: id as string }, { now, signal: request.signal });
  sameContext(db, request, before, origin);
  snapshot(db, request, handle, now(), origin);
  return resultWithReview(db, request, result, now(), origin);
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
export function saveReview(db: DatabaseSync, request: Request, handle: unknown, fields: ManualTitleInput, source: unknown, cover: unknown, confirmationId?: unknown, origin?: string, now = () => new Date()) {
  const current = snapshot(db, request, handle, now(), origin);
  if (current.kind !== "item") throw new AccessError();
  const item = current.item;
  if (item.provenance.freshness.refreshBy && item.provenance.freshness.refreshBy <= now().toISOString()) throw new AccessError();
  const original = values(item), reviewed = reviewedValues(fields, source, cover);
  const expires = item.provenance.freshness.refreshBy ?? new Date(new Date(item.provenance.retrievedAt).getTime() + 30 * 86400000).toISOString();
  return saveTitle(db, request, { kind: "provider", fields, provider: { ...item.identity, sourceUrl: reviewed.sourceUrl, coverUrl: reviewed.coverUrl }, ...(confirmationId === undefined ? {} : { confirmationId }) }, origin, { beforeCommit(result) {
    snapshot(db, request, handle, now(), origin);
    if (result.kind === "created") for (const field of storedFields) {
      const acquired = item.provenance.acquiredFields.includes(field === "duration" ? "duration" : field);
      const providerOwned = acquired && equal(original[field], reviewed[field]);
      db.prepare("INSERT INTO metadata_fields(title_id,field,origin,retrieved_at,expires_at) VALUES (?,?,?,?,?)")
        .run(result.id, field, providerOwned ? "provider" : "user", providerOwned ? item.provenance.retrievedAt : null, providerOwned ? expires : null);
    }
    if (["created", "existing", "restored"].includes(result.kind)) db.prepare("DELETE FROM metadata_reviews WHERE handle_hash=?").run(hash(handle as string));
  } });
}
/** Only still-provider-owned fields are refreshed; concurrent manual corrections win. */
export async function refreshTitleMetadata(db: DatabaseSync, request: Request, id: string, providers: Providers, origin?: string, now = () => new Date()): Promise<LookupResult> {
  const before = authorized(db, request, origin); authorizeRequest(db, request, { kind: "title", id }, { mutation: true, configuredOrigin: origin }); ensureFreshMetadata(db, now());
  const row = db.prepare("SELECT provider_namespace,provider_id FROM titles WHERE id=? AND group_id=?").get(id, before.groupId)!;
  if (row.provider_namespace !== "youtube" && row.provider_namespace !== "kinopoisk_unofficial") return lookupFailure("invalid_query");
  const result = await lookupMetadata(providers[row.provider_namespace], { kind: "detail", externalId: row.provider_id as string }, { now, signal: request.signal });
  sameContext(db, request, before, origin); authorizeRequest(db, request, { kind: "title", id }, { mutation: true, configuredOrigin: origin });
  if (result.kind !== "available" && result.kind !== "incomplete") { ensureFreshMetadata(db, now()); return result; }
  const item = projectPolicy(result.item), fresh = values(item), expires = item.provenance.freshness.refreshBy ?? new Date(new Date(item.provenance.retrievedAt).getTime() + 30 * 86400000).toISOString();
  db.exec("BEGIN IMMEDIATE");
  try {
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
