import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { authorizeRequest } from "./request-access";
import { AccessError, credentialHash, readSessionCookie } from "./sessions";
import { avatarPalette, type ProfileView } from "./profile-state";

export class ProfileFieldError extends Error {
  field: "name" | "color";
  constructor(field: "name" | "color", message: string) { super(message); this.field = field; }
}
export function normalizeProfileName(value: unknown): string {
  if (typeof value !== "string") throw new ProfileFieldError("name", "Enter a name using text.");
  const name = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
  if (!name || name.includes("\0") || [...name].length > 40) throw new ProfileFieldError("name", "Use a name with 1–40 characters and no unsupported characters.");
  return name;
}

export function getProfileView(db: DatabaseSync, request: Request): ProfileView {
  const context = authorizeRequest(db, request);
  return { activeMemberId: context.activeMemberId, members: db.prepare("SELECT id,name,avatar_color FROM members WHERE group_id=? AND (?='legacy' OR EXISTS(SELECT 1 FROM account_memberships a WHERE a.member_id=members.id AND a.group_id=members.group_id AND a.status='active')) ORDER BY created_at,id")
    .all(context.groupId,context.mode).map((row) => ({ id: row.id as string, name: row.name as string, color: row.avatar_color as string })) };
}

export function changeProfile(
  db: DatabaseSync, request: Request,
  input: { intent: unknown; name?: unknown; color?: unknown; memberId?: unknown; groupId?: unknown },
  configuredOrigin: string | undefined,
): ProfileView {
  // Deny forged access/origins before any validation response or write.
  if (authorizeRequest(db, request, undefined, { mutation: true, claimedGroupId: input.groupId, configuredOrigin, contextKind:"picker" }).mode !== "legacy") throw new AccessError();
  if (input.intent !== "create" && input.intent !== "select") throw new AccessError();
  db.exec("BEGIN IMMEDIATE");
  try {
    const context = authorizeRequest(db, request, input.intent === "select" ? { kind: "member", id: input.memberId as string } : undefined,
      { mutation: true, claimedGroupId: input.groupId, configuredOrigin, contextKind:"picker" });
    let memberId: string;
    if (input.intent === "create") {
      const name = normalizeProfileName(input.name);
      if (typeof input.color !== "string" || !avatarPalette.some((color) => color.value === input.color)) {
        throw new ProfileFieldError("color", "Choose one of the six available colors.");
      }
      const key = name.toLowerCase();
      if (db.prepare("SELECT 1 FROM members WHERE group_id=? AND name_key=?").get(context.groupId, key)) {
        throw new ProfileFieldError("name", "This name is already used in your group. Choose another name.");
      }
      memberId = randomUUID();
      db.prepare("INSERT INTO members(id,group_id,name,name_key,avatar_color) VALUES (?,?,?,?,?)")
        .run(memberId, context.groupId, name, key, input.color);
    } else memberId = input.memberId as string;
    const credential = readSessionCookie(request.headers.get("cookie"))!;
    const changed = db.prepare("UPDATE group_sessions SET active_member_id=? WHERE token_hash=? AND group_id=?")
      .run(memberId, credentialHash(credential), context.groupId);
    if (changed.changes !== 1) throw new AccessError();
    const freshRequest = new Request(request); freshRequest.headers.delete("x-watchnext-context");
    const result = getProfileView(db, freshRequest);
    db.exec("COMMIT");
    return result;
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}
