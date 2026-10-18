import { randomBytes, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { authorizeRequest } from "../request-access";
import { AccessError, credentialHash } from "../sessions";
import { resolveAppOrigin } from "../groups";

function context(db: DatabaseSync, request: Request, origin?: string, mutation=false) {
  const session=authorizeRequest(db,request,undefined,{mutation,configuredOrigin:origin});
  if(session.mode!=="account")throw new AccessError();
  const group=db.prepare("SELECT owner_account_id,invite_generation FROM groups WHERE id=? AND access_mode='account'").get(session.groupId);
  if(!group)throw new AccessError();
  return {...session,ownerAccountId:group.owner_account_id as string,owner:group.owner_account_id===session.accountId,generation:group.invite_generation as number};
}
export function readGroupManagement(db: DatabaseSync, request: Request) {
  const current=context(db,request);
  const members=db.prepare(`SELECT m.id,m.name,m.avatar_color,a.status,a.joined_invite_generation,a.account_id
    FROM account_memberships a JOIN members m ON m.id=a.member_id AND m.group_id=a.group_id
    WHERE a.group_id=? ORDER BY a.created_at,m.id`).all(current.groupId).map(row=>({id:row.id as string,name:row.name as string,color:row.avatar_color as string,
      status:row.status as "active"|"removed",generation:row.joined_invite_generation as number,owner:row.account_id===current.ownerAccountId}));
  return {groupId:current.groupId,contextKey:current.contextKey,generation:current.generation,canManage:current.owner,activeMemberId:current.activeMemberId,members};
}
export type GroupManagement=ReturnType<typeof readGroupManagement>;

/** The displayed context is a stale-intent check, never a substitute for live owner authority. */
export function managementRequest(request: Request, claimed: unknown) {
  if(typeof claimed!=="string"||!/^[0-9a-f]{64}$/.test(claimed))throw new AccessError();
  const bound=new Request(request.url,{method:request.method,headers:request.headers,signal:request.signal});bound.headers.set("x-watchnext-context",claimed);return bound;
}
export function removeParticipant(db: DatabaseSync, request: Request, memberId: unknown, generation: unknown, origin?: string) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const current=context(db,request,origin,true);
    if(!current.owner||typeof memberId!=="string"||memberId===current.activeMemberId||!Number.isSafeInteger(generation))throw new AccessError();
    const target=db.prepare("SELECT status,joined_invite_generation FROM account_memberships WHERE group_id=? AND member_id=?").get(current.groupId,memberId);
    if(!target||target.joined_invite_generation!==generation)throw new AccessError();
    const alreadyRemoved=target.status==="removed";
    if(!alreadyRemoved)db.prepare("UPDATE account_memberships SET status='removed',removed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),removed_invite_generation=? WHERE group_id=? AND member_id=?")
      .run(current.generation,current.groupId,memberId);
    const view=readGroupManagement(db,request);db.exec("COMMIT");return {...view,outcome:alreadyRemoved?"already_removed" as const:"removed" as const};
  }catch(error){db.exec("ROLLBACK");throw error;}
}
export function rotateGroupInvite(db: DatabaseSync, request: Request, expectedGeneration: unknown, origin?: string) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const current=context(db,request,origin,true);
    if(!current.owner||!Number.isSafeInteger(expectedGeneration)||expectedGeneration!==current.generation||current.generation>=2147483647)throw new AccessError();
    const token=randomBytes(32).toString("base64url"),next=current.generation+1;
    db.prepare("UPDATE groups SET invite_generation=? WHERE id=?").run(next,current.groupId);
    db.prepare("UPDATE invitations SET revoked_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE group_id=? AND revoked_at IS NULL").run(current.groupId);
    db.prepare("INSERT INTO invitations(id,group_id,token_hash,generation) VALUES (?,?,?,?)").run(randomUUID(),current.groupId,credentialHash(token),next);
    const view=readGroupManagement(db,request);db.exec("COMMIT");
    return {...view,inviteUrl:`${resolveAppOrigin(origin).origin}/invite/${token}`};
  }catch(error){db.exec("ROLLBACK");throw error;}
}
