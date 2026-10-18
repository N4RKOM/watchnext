import type { DatabaseSync } from "node:sqlite";
import { AccessError, credentialHash, readSessionCookie, requireSession, validCredential } from "../sessions";
import { accountCookieName, accountCredential } from "./credentials";
export const modeCookieName = "watchnext_access_mode";
export function namedCookie(header: string | null, name: string) {
  const values = (header ?? "").split(";").map(part => part.trim()).filter(part => part.startsWith(name + "="));
  return values.length === 1 ? values[0].slice(name.length + 1) : undefined;
}
export function accountSession(db: DatabaseSync, request: Request) {
  const credential = accountCredential(request.headers.get("cookie"));
  if (!validCredential(credential)) throw new AccessError();
  const row = db.prepare(`SELECT s.token_hash,s.account_id,s.selected_group_id,s.context_revision,a.username FROM account_sessions s
    JOIN accounts a ON a.id=s.account_id WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>?`)
    .get(credentialHash(credential), Math.floor(Date.now()/1000));
  if (!row) throw new AccessError();
  return { tokenHash: row.token_hash as string, accountId: row.account_id as string, username: row.username as string, groupId: row.selected_group_id as string | null, revision: row.context_revision as number };
}
export function requestContext(db: DatabaseSync, request: Request) {
  const raw = request.headers.get("cookie"), mode = namedCookie(raw, modeCookieName);
  const hasAccount = (raw ?? "").split(";").some(value => value.trim().startsWith(accountCookieName+"="));
  const hasLegacy = (raw ?? "").split(";").some(value => value.trim().startsWith("watchnext_session="));
  const hasMode = (raw ?? "").split(";").some(value => value.trim().startsWith(modeCookieName+"="));
  let groupId: string, groupName: string, activeMemberId: string | null, revision: number, tokenHash: string, accountId: string | undefined;
  let selectedMode: "account" | "legacy";
  if (mode === "account") {
    selectedMode = "account"; const session = accountSession(db, request);
    const membership = db.prepare(`SELECT m.member_id,g.name FROM account_memberships m JOIN groups g ON g.id=m.group_id
      WHERE m.account_id=? AND m.group_id=? AND m.status='active' AND g.access_mode='account'`).get(session.accountId, session.groupId);
    if (!membership) throw new AccessError();
    groupId = session.groupId!; groupName = membership.name as string; activeMemberId = membership.member_id as string;
    revision = session.revision; tokenHash = session.tokenHash; accountId = session.accountId;
  } else if (mode === "legacy" || (!hasMode && hasLegacy && !hasAccount)) {
    selectedMode = "legacy"; const credential = readSessionCookie(raw), group = requireSession(db, credential);
    const row = db.prepare("SELECT context_revision FROM group_sessions WHERE token_hash=?").get(credentialHash(credential!));
    groupId = group.groupId; groupName = group.groupName; activeMemberId = group.activeMemberId;
    revision = row!.context_revision as number; tokenHash = credentialHash(credential!);
  } else throw new AccessError();
  const contextKey = credentialHash(JSON.stringify([selectedMode,tokenHash,groupId,activeMemberId,revision]));
  const pickerOwnerKey = selectedMode === "account" ? contextKey : credentialHash(JSON.stringify([selectedMode,tokenHash,groupId,revision]));
  return { groupId, groupName, activeMemberId, mode: selectedMode, accountId, revision, contextKey, ownerKey: contextKey, pickerOwnerKey };
}
