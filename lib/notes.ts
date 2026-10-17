import type { DatabaseSync } from "node:sqlite";
import { requireTitleMember } from "./title-access";
import { authorizeRequest } from "./request-access";
import { AccessError } from "./sessions";
import { inspectNoteDraft, type OwnNote } from "./note-state";
export class NoteFieldError extends Error {}
export function normalizeNote(body: unknown): string | null {
  if (typeof body !== "string") throw new NoteFieldError("Enter a plain-text note, or leave it blank to clear your note.");
  const result = inspectNoteDraft(body); if (result.error) throw new NoteFieldError(result.error); return result.normalized || null;
}
function currentTitle(db: DatabaseSync, request: Request, id: string, input?: Record<string, unknown>, configuredOrigin?: string) {
  if (input && (typeof input.memberId !== "string" || !input.memberId)) throw new AccessError();
  const context = requireTitleMember(db, request, { mutation: Boolean(input), memberId: input?.memberId, groupId: input?.groupId, configuredOrigin });
  authorizeRequest(db, request, { kind: "title", id }, { mutation: Boolean(input), configuredOrigin });
  const row = db.prepare("SELECT archived FROM titles WHERE id=? AND group_id=?").get(id, context.groupId);
  if (!row || (input && row.archived !== 0)) throw new AccessError(); return context;
}
export function readOwnNote(db: DatabaseSync, request: Request, id: string): OwnNote {
  const context = currentTitle(db, request, id);
  const row = db.prepare("SELECT body FROM notes WHERE title_id=? AND group_id=? AND member_id=?").get(id, context.groupId, context.activeMemberId!);
  return { memberId: context.activeMemberId!, body: row ? row.body as string : null };
}
export function updateOwnNote(db: DatabaseSync, request: Request, id: string, input: Record<string, unknown>, configuredOrigin?: string): OwnNote {
  db.exec("BEGIN IMMEDIATE");
  try {
    const context = currentTitle(db, request, id, input, configuredOrigin);
    if (Object.keys(input).some(key => !["intent", "memberId", "groupId", "body"].includes(key))) throw new NoteFieldError("Only your whole-title note can be changed here.");
    if (input.intent !== "save_note" && input.intent !== "clear_note") throw new NoteFieldError("Choose Save note or Clear my note.");
    const body = input.intent === "clear_note" ? null : normalizeNote(input.body);
    if (body === null) db.prepare("DELETE FROM notes WHERE group_id=? AND title_id=? AND member_id=?").run(context.groupId, id, context.activeMemberId!);
    else db.prepare(`INSERT INTO notes(group_id,title_id,member_id,body) VALUES (?,?,?,?)
      ON CONFLICT(title_id,member_id) DO UPDATE SET body=excluded.body WHERE notes.body<>excluded.body`).run(context.groupId, id, context.activeMemberId!, body);
    const result = readOwnNote(db, request, id); db.exec("COMMIT"); return result;
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}
