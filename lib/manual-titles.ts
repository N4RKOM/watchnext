import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { authorizeRequest } from "./request-access";
import { AccessError } from "./sessions";
import { contentTypes, fixedMoods, type SavedTitle, type TitleField } from "./title-state";
import { safeExternalUrl } from "./urls";

export class TitleFieldError extends Error {
  constructor(public field: TitleField, message: string) { super(message); }
}
export class TitleCollisionError extends TitleFieldError {
  constructor() { super("title", "A title with this name and type is already saved, including archived titles. For a different work, add a distinguishing detail such as its year. Nothing was changed."); }
}
export type ManualTitleInput = Record<TitleField, unknown> & { groupId?: unknown; memberId?: unknown };
const fail = (field: TitleField, message: string): never => { throw new TitleFieldError(field, message); };
function text(value: unknown, field: TitleField) { return typeof value === "string" ? value.trim() : fail(field, "Enter text in this field."); }
export function validateManualTitle(input: ManualTitleInput) {
  const title = text(input.title, "title");
  if (!title || title.includes("\0") || [...title].length > 200) fail("title", "Enter a title with 1–200 characters and no unsupported characters.");
  const titleKey = title.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase();
  if (!titleKey) fail("title", "Enter a title with 1–200 characters.");
  const contentType = text(input.contentType, "contentType");
  if (!contentTypes.some((type) => type.value === contentType)) fail("contentType", "Choose Movie, Series, Anime, or YouTube video.");
  const component = (value: unknown, field: "minutes" | "seconds", maximum: number, optional = false) => {
    const raw = text(value, field);
    if (optional && raw === "") return 0;
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw)) || Number(raw) > maximum) fail(field, `Enter whole ${field} from 0 to ${maximum}.`);
    return Number(raw);
  };
  const minutes = component(input.minutes, "minutes", 1440), seconds = component(input.seconds, "seconds", 59, true);
  const durationSeconds = minutes * 60 + seconds;
  if (durationSeconds < 1 || durationSeconds > 86400) fail("minutes", "Total duration must be from 1 second to 1440 minutes (24 hours).");
  const numberingStyle = text(input.numberingStyle, "numberingStyle");
  const episodic = contentType === "series" || contentType === "anime";
  if (!(episodic ? ["season_episode", "continuous"] : ["none"]).includes(numberingStyle)) fail("numberingStyle", episodic ? "Choose Season + episode or Continuous numbering." : "Movies and videos do not use episode numbering.");
  if (!Array.isArray(input.moods) || input.moods.length === 0 || input.moods.some((value) => !fixedMoods.some((mood) => mood.value === value))) fail("moods", "Choose at least one of the five available moods.");
  const moods = [...new Set(input.moods as string[])];
  const rawGenres = text(input.genres, "genres");
  const genres = new Map<string, string>();
  if (rawGenres) for (const part of rawGenres.split(",")) {
    const label = part.trim();
    if (!label || [...label].length > 40 || label.includes("\0")) fail("genres", "Use comma-separated genres with 1–40 characters each, up to ten distinct genres.");
    if (!genres.has(label.toLowerCase())) genres.set(label.toLowerCase(), label);
  }
  if (genres.size > 10) fail("genres", "Use no more than ten distinct genres.");
  const rawUrl = text(input.watchUrl, "watchUrl");
  let watchUrl: string | null = null;
  if (rawUrl) {
    watchUrl = safeExternalUrl(rawUrl);
    if (!watchUrl) fail("watchUrl", "Enter a complete HTTP or HTTPS link without a username or password, or leave it blank.");
  }
  return { title, titleKey, contentType, durationSeconds, numberingStyle, moods, genres, watchUrl };
}

export function requireTitleMember(db: DatabaseSync, request: Request, options: { mutation?: boolean; configuredOrigin?: string; groupId?: unknown; memberId?: unknown } = {}) {
  const context = authorizeRequest(db, request, undefined, { mutation: options.mutation, configuredOrigin: options.configuredOrigin, claimedGroupId: options.groupId });
  if (!context.activeMemberId || (options.memberId !== undefined && options.memberId !== context.activeMemberId)) throw new AccessError();
  return context;
}

/** New-entry baseline only. #13 integrates confirmed matching/merge without duplicating this transaction. */
export function saveNewManualTitle(db: DatabaseSync, request: Request, input: ManualTitleInput, configuredOrigin?: string): string {
  requireTitleMember(db, request, { mutation: true, configuredOrigin, groupId: input.groupId, memberId: input.memberId });
  const value = validateManualTitle(input);
  db.exec("BEGIN IMMEDIATE");
  try {
    const context = requireTitleMember(db, request, { mutation: true, configuredOrigin, groupId: input.groupId, memberId: input.memberId });
    if (db.prepare("SELECT id FROM titles WHERE group_id=? AND content_type=? AND title_key=?").get(context.groupId, value.contentType, value.titleKey)) throw new TitleCollisionError();
    const id = randomUUID();
    db.prepare("INSERT INTO titles(id,group_id,title,title_key,content_type,duration_seconds,numbering_style,watch_url) VALUES (?,?,?,?,?,?,?,?)")
      .run(id, context.groupId, value.title, value.titleKey, value.contentType, value.durationSeconds, value.numberingStyle, value.watchUrl);
    for (const mood of value.moods) db.prepare("INSERT INTO title_moods(title_id,mood_code) VALUES (?,?)").run(id, mood);
    for (const [key, label] of value.genres) db.prepare("INSERT INTO title_genres(title_id,genre_key,label) VALUES (?,?,?)").run(id, key, label);
    db.prepare("INSERT INTO contributors(group_id,title_id,member_id) VALUES (?,?,?)").run(context.groupId, id, context.activeMemberId!);
    db.exec("COMMIT"); return id;
  } catch (error) {
    db.exec("ROLLBACK");
    // Match only this identity constraint; other storage errors remain retryable failures.
    if (error instanceof Error && error.message.includes("UNIQUE constraint failed: titles.group_id, titles.content_type, titles.title_key")) throw new TitleCollisionError();
    throw error;
  }
}

export function readSavedTitle(db: DatabaseSync, request: Request, id: string): SavedTitle {
  requireTitleMember(db, request);
  authorizeRequest(db, request, { kind: "title", id });
  const row = db.prepare("SELECT id,title,content_type,duration_seconds,numbering_style,watch_url FROM titles WHERE id=? AND archived=0").get(id);
  if (!row) throw new AccessError();
  return { id: row.id as string, title: row.title as string, contentType: row.content_type as string, durationSeconds: row.duration_seconds as number,
    numberingStyle: row.numbering_style as string, watchUrl: safeExternalUrl(row.watch_url),
    moods: db.prepare("SELECT m.label FROM title_moods tm JOIN moods m ON m.code=tm.mood_code WHERE tm.title_id=? ORDER BY m.rowid").all(id).map((r) => r.label as string),
    genres: db.prepare("SELECT label FROM title_genres WHERE title_id=? ORDER BY genre_key").all(id).map((r) => r.label as string),
    contributors: db.prepare("SELECT m.name FROM contributors c JOIN members m ON m.id=c.member_id AND m.group_id=c.group_id WHERE c.title_id=? ORDER BY c.created_at,m.id").all(id).map((r) => r.name as string) };
}
