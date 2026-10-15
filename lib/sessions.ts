import { createHash, randomBytes } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

export const sessionCookieName = "watchnext_session";
export class AccessError extends Error {
  constructor() { super("Group access is unavailable. Open a valid invitation to continue."); }
}
export function validCredential(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value) &&
    Buffer.from(value, "base64url").length === 32 && Buffer.from(value, "base64url").toString("base64url") === value;
}
export const credentialHash = (value: string) => createHash("sha256").update(value).digest("hex");
export type GroupSession = { groupId: string; groupName: string; activeMemberId: string | null };

export function requireSession(db: DatabaseSync, credential: unknown): GroupSession {
  if (!validCredential(credential)) throw new AccessError();
  const row = db.prepare(`SELECT s.group_id, g.name, s.active_member_id FROM group_sessions s
    JOIN invitations i ON i.id = s.invitation_id AND i.group_id = s.group_id AND i.revoked_at IS NULL
    JOIN groups g ON g.id = s.group_id WHERE s.token_hash = ?`).get(credentialHash(credential));
  if (!row) throw new AccessError();
  return { groupId: row.group_id as string, groupName: row.name as string, activeMemberId: row.active_member_id as string | null };
}

export function acceptInvitation(db: DatabaseSync, invitationToken: unknown, previousCredential?: unknown): string {
  if (!validCredential(invitationToken)) throw new AccessError();
  db.exec("BEGIN IMMEDIATE");
  try {
    const invitation = db.prepare("SELECT id,group_id FROM invitations WHERE token_hash=? AND revoked_at IS NULL")
      .get(credentialHash(invitationToken));
    if (!invitation) throw new AccessError();
    let previous: GroupSession | undefined;
    try { previous = requireSession(db, previousCredential); } catch { /* A stale cookie grants no context. */ }
    const credential = randomBytes(32).toString("base64url");
    db.prepare("INSERT INTO group_sessions(token_hash,group_id,invitation_id,active_member_id) VALUES (?,?,?,?)")
      .run(credentialHash(credential), invitation.group_id, invitation.id,
        previous?.groupId === invitation.group_id ? previous.activeMemberId : null);
    if (validCredential(previousCredential)) db.prepare("DELETE FROM group_sessions WHERE token_hash=?").run(credentialHash(previousCredential));
    db.exec("COMMIT");
    return credential;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function cookieOptions(origin: string) {
  return { httpOnly: true, sameSite: "lax" as const, path: "/", secure: new URL(origin).protocol === "https:" };
}

export function readSessionCookie(header: string | null): string | undefined {
  const values = (header ?? "").split(";").map((part) => part.trim()).filter((part) => part.startsWith(sessionCookieName + "="));
  if (values.length !== 1) return undefined;
  return values[0].slice(sessionCookieName.length + 1);
}
