import { randomBytes, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { AccessError, credentialHash, readSessionCookie, validCredential } from "../sessions";
import { resolveAppOrigin, validateGroupName } from "../groups";
import { avatarPalette } from "../profile-state";
import { requireAccountPost } from "./http";
import { accountSession, namedCookie } from "./context";
export const pendingInviteCookieName = "watchnext_pending_invite";

export function accountGroups(db: DatabaseSync, request: Request) {
  const session = accountSession(db, request);
  const groups = db.prepare(`SELECT g.id,g.name,g.owner_account_id,m.member_id FROM account_memberships m JOIN groups g ON g.id=m.group_id
    WHERE m.account_id=? AND m.status='active' AND g.access_mode='account' ORDER BY g.created_at,g.id`).all(session.accountId)
    .map(row => ({ id: row.id as string, name: row.name as string, owner: row.owner_account_id === session.accountId, memberId: row.member_id as string }));
  return { username: session.username, selectedGroupId: groups.some(group => group.id === session.groupId) ? session.groupId : null, revision: session.revision, groups };
}
function member(db: DatabaseSync, accountId: string, username: string, groupId: string, generation: number) {
  const previous = db.prepare("SELECT member_id,status,removed_invite_generation FROM account_memberships WHERE account_id=? AND group_id=?").get(accountId, groupId);
  if (previous) {
    if (previous.status === "removed") {
      if (generation <= (previous.removed_invite_generation as number)) throw new AccessError();
      db.prepare("UPDATE account_memberships SET status='active',joined_invite_generation=?,removed_at=NULL,removed_invite_generation=NULL WHERE account_id=? AND group_id=?")
        .run(generation, accountId, groupId);
    }
    return previous.member_id as string;
  }
  const id = randomUUID(), color = avatarPalette[parseInt(credentialHash(accountId).slice(0,8),16) % avatarPalette.length].value;
  db.prepare("INSERT INTO members(id,group_id,name,name_key,avatar_color) VALUES (?,?,?,?,?)").run(id,groupId,username,username.toLowerCase(),color);
  db.prepare("INSERT INTO account_memberships(account_id,group_id,member_id,joined_invite_generation) VALUES (?,?,?,?)").run(accountId,groupId,id,generation);
  return id;
}
function checkRevision(session: ReturnType<typeof accountSession>, revision: unknown) {
  if (!Number.isSafeInteger(revision) || revision !== session.revision) throw new AccessError();
}
function invalidateLegacy(db: DatabaseSync, request: Request) {
  const credential = readSessionCookie(request.headers.get("cookie"));
  if (validCredential(credential)) db.prepare("UPDATE group_sessions SET context_revision=context_revision+1 WHERE token_hash=?").run(credentialHash(credential));
}
function select(db: DatabaseSync, request: Request, session: ReturnType<typeof accountSession>, groupId: string | null) {
  db.prepare("UPDATE account_sessions SET selected_group_id=?,context_revision=context_revision+1 WHERE token_hash=?").run(groupId,session.tokenHash);
  invalidateLegacy(db,request);
}
export function createAccountGroup(db: DatabaseSync, request: Request, name: unknown, revision: unknown, origin?: string) {
  requireAccountPost(request,origin); const groupName = validateGroupName(name), configured = resolveAppOrigin(origin);
  db.exec("BEGIN IMMEDIATE");
  try {
    const session = accountSession(db,request); checkRevision(session,revision);
    const id = randomUUID(), invitationId = randomUUID(), token = randomBytes(32).toString("base64url");
    db.prepare("INSERT INTO groups(id,name,access_mode,owner_account_id) VALUES (?,?,'account',?)").run(id,groupName,session.accountId);
    member(db,session.accountId,session.username,id,1);
    db.prepare("INSERT INTO invitations(id,group_id,token_hash,generation) VALUES (?,?,?,1)").run(invitationId,id,credentialHash(token));
    select(db,request,session,id); const view = accountGroups(db,request); db.exec("COMMIT");
    return { ...view, inviteUrl: `${configured.origin}/invite/${token}`, name: groupName };
  } catch(error) { db.exec("ROLLBACK"); throw error; }
}
function validInvitation(db: DatabaseSync, invitationId: string) {
  const row = db.prepare(`SELECT i.id,i.group_id,i.generation,g.name FROM invitations i JOIN groups g ON g.id=i.group_id
    WHERE i.id=? AND g.access_mode='account' AND i.revoked_at IS NULL AND i.generation=g.invite_generation`).get(invitationId);
  if (!row) throw new AccessError(); return row;
}
export function beginAccountInvite(db: DatabaseSync, token: unknown, now = Math.floor(Date.now()/1000)) {
  if (!validCredential(token)) throw new AccessError();
  db.exec("BEGIN IMMEDIATE");
  try {
    const invitation = db.prepare("SELECT id FROM invitations WHERE token_hash=?").get(credentialHash(token));
    if (!invitation) throw new AccessError(); validInvitation(db,invitation.id as string);
    db.prepare("DELETE FROM pending_group_invitations WHERE expires_at<=?").run(now);
    if ((db.prepare("SELECT count(*) AS n FROM pending_group_invitations").get()!.n as number) >= 1000) throw new AccessError();
    const intent = randomBytes(32).toString("base64url");
    db.prepare("INSERT INTO pending_group_invitations(intent_hash,invitation_id,expires_at) VALUES (?,?,?)").run(credentialHash(intent),invitation.id,now+600);
    db.exec("COMMIT"); return intent;
  } catch(error) { db.exec("ROLLBACK"); throw error; }
}
function pending(db: DatabaseSync, request: Request) {
  const intent = namedCookie(request.headers.get("cookie"),pendingInviteCookieName);
  if (!validCredential(intent)) throw new AccessError();
  const row = db.prepare("SELECT invitation_id FROM pending_group_invitations WHERE intent_hash=? AND expires_at>?").get(credentialHash(intent),Math.floor(Date.now()/1000));
  if (!row) throw new AccessError();
  return { intentHash: credentialHash(intent), invitation: validInvitation(db,row.invitation_id as string) };
}
export function pendingAccountInvite(db: DatabaseSync, request: Request) {
  accountSession(db,request);
  if (!namedCookie(request.headers.get("cookie"),pendingInviteCookieName)) return null;
  try { const value = pending(db,request); return { name: value.invitation.name as string, available: true }; }
  catch { return { name: "", available: false }; }
}
export function joinAccountGroup(db: DatabaseSync, request: Request, revision: unknown, origin?: string) {
  requireAccountPost(request,origin); db.exec("BEGIN IMMEDIATE");
  try {
    const session = accountSession(db,request); checkRevision(session,revision);
    const value = pending(db,request), invitation = value.invitation;
    member(db,session.accountId,session.username,invitation.group_id as string,invitation.generation as number);
    select(db,request,session,invitation.group_id as string);
    db.prepare("DELETE FROM pending_group_invitations WHERE intent_hash=?").run(value.intentHash);
    const view = accountGroups(db,request); db.exec("COMMIT"); return view;
  } catch(error) { db.exec("ROLLBACK"); throw error; }
}
export function switchAccountGroup(db: DatabaseSync, request: Request, groupId: unknown, revision: unknown, origin?: string) {
  requireAccountPost(request,origin); db.exec("BEGIN IMMEDIATE");
  try {
    const session = accountSession(db,request); checkRevision(session,revision);
    if (typeof groupId !== "string" || !db.prepare("SELECT 1 FROM account_memberships WHERE account_id=? AND group_id=? AND status='active'").get(session.accountId,groupId)) throw new AccessError();
    select(db,request,session,groupId); const view = accountGroups(db,request); db.exec("COMMIT"); return view;
  } catch(error) { db.exec("ROLLBACK"); throw error; }
}
export function useLegacyMode(db: DatabaseSync, request: Request, revision: unknown, origin?: string) {
  requireAccountPost(request,origin); db.exec("BEGIN IMMEDIATE");
  try { const session = accountSession(db,request); checkRevision(session,revision); select(db,request,session,session.groupId); db.exec("COMMIT"); }
  catch(error) { db.exec("ROLLBACK"); throw error; }
}
