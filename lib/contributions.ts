import type { DatabaseSync } from "node:sqlite";
import { requireTitleMember } from "./title-access";
import { authorizeRequest } from "./request-access";
import { AccessError, type GroupSession } from "./sessions";

/** Called only inside a validated immediate transaction by shared save/restore. */
export function saveContribution(db: DatabaseSync, context: GroupSession, id: string) {
  if (!context.activeMemberId) throw new AccessError();
  const row = db.prepare("SELECT archived,title FROM titles WHERE id=? AND group_id=?").get(id, context.groupId);
  if (!row) throw new AccessError();
  const restored = row.archived === 1;
  const alreadyAdded = Boolean(db.prepare("SELECT 1 FROM contributors WHERE title_id=? AND group_id=? AND member_id=?").get(id, context.groupId, context.activeMemberId));
  if (restored && db.prepare("UPDATE titles SET archived=0 WHERE id=? AND group_id=?").run(id, context.groupId).changes !== 1) throw new Error("Restoration did not complete");
  if (!alreadyAdded && db.prepare("INSERT INTO contributors(group_id,title_id,member_id) VALUES (?,?,?)").run(context.groupId, id, context.activeMemberId).changes !== 1) throw new Error("Contribution was not saved");
  return { restored, alreadyAdded, title: row.title as string };
}
type Claims = { groupId?: unknown; memberId?: unknown };
function access(db: DatabaseSync, request: Request, id: string, claims: Claims, configuredOrigin?: string) {
  const context = requireTitleMember(db, request, { mutation: true, configuredOrigin, ...claims });
  authorizeRequest(db, request, { kind: "title", id }, { mutation: true, configuredOrigin, claimedGroupId: claims.groupId });return context;
}
export function restoreTitle(db: DatabaseSync, request: Request, id: string, claims: Claims = {}, configuredOrigin?: string) {
  access(db, request, id, claims, configuredOrigin);db.exec("BEGIN IMMEDIATE");
  try {
    const context = access(db, request, id, claims, configuredOrigin), result = saveContribution(db, context, id);
    db.exec("COMMIT");return { kind: result.restored ? "restored" as const : "existing" as const, id, ...result };
  } catch (error) { db.exec("ROLLBACK");throw error; }
}
export function removeOwnContribution(db: DatabaseSync, request: Request, id: string, claims: Claims = {}, configuredOrigin?: string) {
  access(db, request, id, claims, configuredOrigin);db.exec("BEGIN IMMEDIATE");
  try {
    const context = access(db, request, id, claims, configuredOrigin);
    const row = db.prepare("SELECT archived FROM titles WHERE id=? AND group_id=?").get(id, context.groupId)!;
    if (row.archived === 1 || !db.prepare("SELECT 1 FROM contributors WHERE title_id=? AND group_id=? AND member_id=?").get(id, context.groupId, context.activeMemberId!)) {
      db.exec("COMMIT");return { kind: "already_removed" as const, id, message: "Your contribution is already removed. Nothing was changed." };
    }
    if (db.prepare("DELETE FROM contributors WHERE title_id=? AND group_id=? AND member_id=?").run(id, context.groupId, context.activeMemberId!).changes !== 1) throw new Error("Contribution was not removed");
    const remaining = db.prepare("SELECT 1 FROM contributors WHERE title_id=? AND group_id=? LIMIT 1").get(id, context.groupId);
    if (!remaining && db.prepare("UPDATE titles SET archived=1 WHERE id=? AND group_id=?").run(id, context.groupId).changes !== 1) throw new Error("Archiving did not complete");
    db.exec("COMMIT");return { kind: remaining ? "removed" as const : "archived" as const, id, message: remaining ? "Your contribution was removed. This title stays on the watchlist for its other contributors." : "Your contribution was removed and this title was archived. Everyone’s history is preserved." };
  } catch (error) { db.exec("ROLLBACK");throw error; }
}
