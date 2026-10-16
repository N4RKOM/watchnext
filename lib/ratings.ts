import type { DatabaseSync } from "node:sqlite";
import { requireTitleMember } from "./title-access";
import { authorizeRequest } from "./request-access";
import { AccessError } from "./sessions";
import type { OwnRating } from "./rating-state";
export class RatingFieldError extends Error {}
/** Form text only: canonical decimal integers after outer-whitespace trimming. */
export function parseRating(score: unknown): number {
  if (typeof score !== "string" || !/^(?:[1-9]|10)$/.test(score.trim())) throw new RatingFieldError("Enter a whole-number rating from 1 to 10, using digits only. Use Clear my rating to remove it.");
  return Number(score.trim());
}
function currentTitle(db: DatabaseSync, request: Request, id: string, input?: Record<string, unknown>, configuredOrigin?: string) {
  if (input && (typeof input.memberId !== "string" || !input.memberId)) throw new AccessError();
  const context = requireTitleMember(db, request, { mutation: Boolean(input), memberId: input?.memberId, groupId: input?.groupId, configuredOrigin });
  authorizeRequest(db, request, { kind: "title", id }, { mutation: Boolean(input), configuredOrigin });
  const row = db.prepare("SELECT archived FROM titles WHERE id=? AND group_id=?").get(id, context.groupId);
  if (!row || (input && row.archived !== 0)) throw new AccessError();
  return context;
}
/** Ratings are not completion/progress predicates and do not require metadata/runtime. */
export function readOwnRating(db: DatabaseSync, request: Request, id: string): OwnRating {
  const context = currentTitle(db, request, id);
  const row = db.prepare("SELECT score FROM ratings WHERE title_id=? AND group_id=? AND member_id=?").get(id, context.groupId, context.activeMemberId!);
  return { memberId: context.activeMemberId!, score: row ? row.score as number : null };
}
export function updateOwnRating(db: DatabaseSync, request: Request, id: string, input: Record<string, unknown>, configuredOrigin?: string): OwnRating {
  db.exec("BEGIN IMMEDIATE");
  try {
    const context = currentTitle(db, request, id, input, configuredOrigin);
    if (Object.keys(input).some(key => !["intent", "memberId", "groupId", "score"].includes(key))) throw new RatingFieldError("Only your whole-title rating can be changed here.");
    if (input.intent === "save_rating") db.prepare(`INSERT INTO ratings(group_id,title_id,member_id,score) VALUES (?,?,?,?)
      ON CONFLICT(title_id,member_id) DO UPDATE SET score=excluded.score WHERE ratings.score<>excluded.score`).run(context.groupId, id, context.activeMemberId!, parseRating(input.score));
    else if (input.intent === "clear_rating") db.prepare("DELETE FROM ratings WHERE group_id=? AND title_id=? AND member_id=?").run(context.groupId, id, context.activeMemberId!);
    else throw new RatingFieldError("Choose Save rating or Clear my rating.");
    const result = readOwnRating(db, request, id); db.exec("COMMIT"); return result;
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}
