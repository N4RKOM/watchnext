import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { requireTitleMember } from "./title-access";
import { authorizeRequest } from "./request-access";
import { AccessError } from "./sessions";
import { validateManualTitle, TitleFieldError, type ManualTitleInput } from "./title-validation";
import { safeExternalUrl } from "./urls";
import type { EditableTitle } from "./edit-title-state";

export class EditUrlError extends Error { constructor(public field: "sourceUrl" | "coverUrl", message: string) { super(message); } }
type EditInput = { fields: ManualTitleInput; sourceUrl: unknown; coverUrl: unknown; revision: unknown; confirmation?: unknown; immutableClaims?: string[] };
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
function permitted(db: DatabaseSync, request: Request, id: string, mutation = false, fields?: ManualTitleInput, configuredOrigin?: string) {
  const context = requireTitleMember(db, request, { mutation, groupId: fields?.groupId, memberId: fields?.memberId, configuredOrigin });
  authorizeRequest(db, request, { kind: "title", id }, { mutation, configuredOrigin });
  const row = db.prepare("SELECT * FROM titles WHERE id=? AND group_id=? AND archived=0").get(id, context.groupId);
  if (!row || !db.prepare("SELECT 1 FROM contributors WHERE title_id=? AND group_id=? AND member_id=?").get(id, context.groupId, context.activeMemberId!)) throw new AccessError();
  return { context, row };
}
function snapshot(db: DatabaseSync, row: Record<string, unknown>) {
  const genres = db.prepare("SELECT genre_key,label FROM title_genres WHERE title_id=? ORDER BY genre_key").all(row.id as string);
  const moods = db.prepare("SELECT mood_code FROM title_moods WHERE title_id=? ORDER BY mood_code").all(row.id as string).map((m) => m.mood_code as string);
  const revision = hash([row.id, row.title, row.title_key, row.content_type, row.duration_seconds, row.numbering_style, row.watch_url, row.source_url, row.cover_url, row.provider_namespace, row.provider_id, genres, moods]);
  return { genres, moods, revision };
}
export function readEditableTitle(db: DatabaseSync, request: Request, id: string): EditableTitle {
  const { row } = permitted(db, request, id), current = snapshot(db, row);
  return { id, revision: current.revision, moods: current.moods, values: { title: row.title as string, contentType: row.content_type as string,
    minutes: String(Math.floor((row.duration_seconds as number) / 60)), seconds: String((row.duration_seconds as number) % 60), numberingStyle: row.numbering_style as string,
    genres: current.genres.map((g) => g.label as string).join(", "), watchUrl: row.watch_url as string | null ?? "", sourceUrl: row.source_url as string | null ?? "", coverUrl: row.cover_url as string | null ?? "" } };
}
function optionalUrl(value: unknown, field: "sourceUrl" | "coverUrl") {
  if (typeof value !== "string") throw new EditUrlError(field, "Enter a link using text, or leave it blank.");
  const raw = value.trim(); if (!raw) return null;
  const result = safeExternalUrl(raw); if (!result) throw new EditUrlError(field, "Use a complete HTTP or HTTPS link without a username or password, or leave it blank.");return result;
}
export function editTitle(db: DatabaseSync, request: Request, id: string, input: EditInput, configuredOrigin?: string) {
  permitted(db, request, id, true, input.fields, configuredOrigin);
  const immutable = ["id", "titleId", "providerNamespace", "providerId", "provider_namespace", "provider_id", "createdAt", "created_at", "archived", "group_id"];
  if (input.immutableClaims?.length || [...Object.keys(input), ...Object.keys(input.fields)].some((key) => immutable.includes(key))) throw new AccessError();
  db.exec("BEGIN IMMEDIATE");
  try {
    const { row, context } = permitted(db, request, id, true, input.fields, configuredOrigin), current = snapshot(db, row);
    if (input.revision !== current.revision) { db.exec("COMMIT");return { kind: "stale" as const, message: "This title changed while you were editing. Your attempted changes are still here. Reload current data before saving." }; }
    const value = validateManualTitle(input.fields), sourceUrl = optionalUrl(input.sourceUrl, "sourceUrl"), coverUrl = optionalUrl(input.coverUrl, "coverUrl");
    if ((value.contentType !== row.content_type || value.numberingStyle !== row.numbering_style) && db.prepare(`SELECT 1 WHERE EXISTS(SELECT 1 FROM progress WHERE title_id=?) OR EXISTS(SELECT 1 FROM ratings WHERE title_id=?) OR EXISTS(SELECT 1 FROM notes WHERE title_id=?)`).get(id, id, id)) {
      throw new TitleFieldError(value.contentType !== row.content_type ? "contentType" : "numberingStyle", "Content type and episode numbering cannot change after progress, ratings or notes have been recorded.");
    }
    if (db.prepare("SELECT 1 FROM titles WHERE group_id=? AND content_type=? AND title_key=? AND id<>?").get(context.groupId, value.contentType, value.titleKey, id)) throw new TitleFieldError("title", "Another active or archived title already uses this name and type. Use a distinguishing title. Nothing was changed.");
    const identityChanged = value.titleKey !== row.title_key || value.contentType !== row.content_type;
    const confirmation = hash([id, current.revision, { ...value, genres: [...value.genres], sourceUrl, coverUrl }]);
    if (identityChanged && input.confirmation !== confirmation) { db.exec("COMMIT"); return { kind: "confirmation" as const, confirmation, title: value.title, message: "This changes the identity of the existing shared entry. It will keep its history and contributors; it will not create or merge another title. Confirm these changes or return to editing." }; }
    if (db.prepare("UPDATE titles SET title=?,title_key=?,content_type=?,duration_seconds=?,numbering_style=?,watch_url=?,source_url=?,cover_url=? WHERE id=? AND group_id=? AND archived=0")
      .run(value.title, value.titleKey, value.contentType, value.durationSeconds, value.numberingStyle, value.watchUrl, sourceUrl, coverUrl, id, context.groupId).changes !== 1) throw new Error("Title update did not complete");
    db.prepare("DELETE FROM title_moods WHERE title_id=?").run(id);db.prepare("DELETE FROM title_genres WHERE title_id=?").run(id);
    for (const mood of value.moods) db.prepare("INSERT INTO title_moods(title_id,mood_code) VALUES (?,?)").run(id, mood);
    for (const [key, label] of value.genres) db.prepare("INSERT INTO title_genres(title_id,genre_key,label) VALUES (?,?,?)").run(id, key, label);
    db.exec("COMMIT");return { kind: "saved" as const, id };
  } catch (error) { db.exec("ROLLBACK");throw error; }
}
