import { ensureFreshMetadata } from "./metadata/lifecycle";
import type { DatabaseSync } from "node:sqlite";
import { authorizeRequest } from "./request-access";
import { AccessError } from "./sessions";
import { requireTitleMember } from "./title-access";
import { safeExternalUrl } from "./urls";
import { saveTitle } from "./shared-save";
import { TitleCollisionError, type ManualTitleInput } from "./title-validation";
import type { SavedTitle } from "./title-state";
export { requireTitleMember } from "./title-access";
export { validateManualTitle, TitleFieldError, TitleCollisionError, type ManualTitleInput } from "./title-validation";

/** Compatibility adapter for the original new-only consumer; all inserts use the shared contract. */
export function saveNewManualTitle(db: DatabaseSync, request: Request, input: ManualTitleInput, configuredOrigin?: string): string {
  const result = saveTitle(db, request, { kind: "manual", fields: input }, configuredOrigin);
  if (result.kind !== "created") throw new TitleCollisionError();
  return result.id;
}

export function readSavedTitle(db: DatabaseSync, request: Request, id: string): SavedTitle {
  requireTitleMember(db, request);
  authorizeRequest(db, request, { kind: "title", id }); ensureFreshMetadata(db);
  const row = db.prepare("SELECT id,title,content_type,duration_seconds,numbering_style,watch_url FROM titles WHERE id=? AND archived=0").get(id);
  if (!row) throw new AccessError();
  return { id: row.id as string, title: row.title as string | null, contentType: row.content_type as string | null, durationSeconds: row.duration_seconds as number | null,
    numberingStyle: row.numbering_style as string, watchUrl: safeExternalUrl(row.watch_url),
    moods: db.prepare("SELECT m.label FROM title_moods tm JOIN moods m ON m.code=tm.mood_code WHERE tm.title_id=? ORDER BY m.rowid").all(id).map((r) => r.label as string),
    genres: db.prepare("SELECT label FROM title_genres WHERE title_id=? ORDER BY genre_key").all(id).map((r) => r.label as string),
    contributors: db.prepare("SELECT m.name FROM contributors c JOIN members m ON m.id=c.member_id AND m.group_id=c.group_id WHERE c.title_id=? ORDER BY c.created_at,m.id").all(id).map((r) => r.name as string) };
}
