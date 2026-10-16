import type { DatabaseSync } from "node:sqlite";
import { authorizeRequest } from "./request-access";
import { requireTitleMember } from "./title-access";
import { AccessError } from "./sessions";
import { ensureFreshMetadata } from "./metadata/lifecycle";
import { projectWatchProgress, usableRuntime } from "./watch-progress-state";

export class TimestampFieldError extends Error {}
export function parseWatchTimestamp(input: unknown): number | null {
  if (typeof input !== "string") throw new TimestampFieldError("Enter a timestamp using M:SS or H:MM:SS, or leave it blank.");
  const value = input.trim(); if (!value) return null;
  const match = /^(?:([0-9]+):([0-5][0-9])|([0-9]+):([0-5][0-9]):([0-5][0-9]))$/.exec(value);
  if (!match) throw new TimestampFieldError("Use M:SS or H:MM:SS with two-digit seconds and valid minute/second components (00–59).");
  const seconds = match[1] === undefined ? Number(match[3]) * 3600 + Number(match[4]) * 60 + Number(match[5]) : Number(match[1]) * 60 + Number(match[2]);
  if (!Number.isSafeInteger(seconds)) throw new TimestampFieldError("Enter a whole-second timestamp within the full duration.");
  return seconds;
}
function currentTitle(db: DatabaseSync, request: Request, id: string, input?: Record<string, unknown>, configuredOrigin?: string) {
  if (input && (typeof input.memberId !== "string" || !input.memberId)) throw new AccessError();
  const context = requireTitleMember(db, request, { mutation: Boolean(input), memberId: input?.memberId, groupId: input?.groupId, configuredOrigin });
  authorizeRequest(db, request, { kind: "title", id }, { mutation: Boolean(input), configuredOrigin }); ensureFreshMetadata(db);
  const row = db.prepare("SELECT numbering_style,content_type,archived,duration_seconds FROM titles WHERE id=? AND group_id=?").get(id, context.groupId)!;
  if (row.numbering_style !== "none" || (row.content_type !== null && !["movie", "youtube"].includes(row.content_type as string))) throw new AccessError();
  if (input && (row.archived !== 0 || input.numberingStyle !== "none")) throw new AccessError();
  return { ...context, fullDurationSeconds: row.duration_seconds as number | null };
}
export function readOwnWatchProgress(db: DatabaseSync, request: Request, id: string) {
  const context = currentTitle(db, request, id);
  const row = db.prepare("SELECT timestamp_seconds,completed FROM progress WHERE group_id=? AND title_id=? AND member_id=?").get(context.groupId, id, context.activeMemberId!);
  return projectWatchProgress(context.activeMemberId!, context.fullDurationSeconds, row ? { timestampSeconds: row.timestamp_seconds as number | null, completed: row.completed === 1 } : null);
}
export function updateWatchProgress(db: DatabaseSync, request: Request, id: string, input: Record<string, unknown>, configuredOrigin?: string) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const context = currentTitle(db, request, id, input, configuredOrigin);
    if (Object.keys(input).some(key => !["intent", "memberId", "groupId", "numberingStyle", "timestamp"].includes(key))) throw new TimestampFieldError("This operation accepts only movie/video timestamp and completion fields.");
    const keys = [context.groupId, id, context.activeMemberId!] as const;
    if (input.intent === "save_timestamp" || input.intent === "clear_timestamp") {
      const timestamp = input.intent === "clear_timestamp" ? null : parseWatchTimestamp(input.timestamp);
      if (timestamp !== null) {
        if (!usableRuntime(context.fullDurationSeconds)) throw new TimestampFieldError("Full duration is unavailable. Restore usable metadata before entering a timestamp. Clearing and completion are still available.");
        if (timestamp > context.fullDurationSeconds) throw new TimestampFieldError("Stopped at must not exceed the current full duration.");
      }
      const changed = db.prepare("UPDATE progress SET timestamp_seconds=? WHERE group_id=? AND title_id=? AND member_id=?").run(timestamp, ...keys).changes;
      // A clear of an absent row stays absent; saved zero still creates a real row.
      if (!changed && timestamp !== null) db.prepare("INSERT INTO progress(group_id,title_id,member_id,numbering_style,timestamp_seconds) VALUES (?,?,?,'none',?)").run(...keys, timestamp);
    } else if (input.intent === "complete" || input.intent === "undo_completion") {
      const completed = input.intent === "complete" ? 1 : 0;
      // Do not name timestamp_seconds in this UPDATE: existing oversized history must
      // not be rewritten/revalidated by current-duration timestamp triggers.
      if (!db.prepare("UPDATE progress SET completed=? WHERE group_id=? AND title_id=? AND member_id=?").run(completed, ...keys).changes) db.prepare("INSERT INTO progress(group_id,title_id,member_id,numbering_style,completed) VALUES (?,?,?,'none',?)").run(...keys, completed);
    } else throw new TimestampFieldError("Choose Save timestamp, Clear timestamp, Mark complete or Undo completion.");
    const result = readOwnWatchProgress(db, request, id); db.exec("COMMIT"); return result;
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}
