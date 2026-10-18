// @vitest-environment node
import { DatabaseSync } from "node:sqlite";
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, expect, it } from "vitest";
import { migrate } from "../../db/migrate";
import { registerAccount, loginAccount, accountCookieName, logoutAccount } from "../../lib/accounts/service";
import { security } from "../../lib/accounts/security";
import { accountSession, requestContext } from "../../lib/accounts/context";
import { accountGroups, beginAccountInvite, createAccountGroup, joinAccountGroup, pendingAccountInvite, pendingInviteCookieName, switchAccountGroup, useLegacyMode } from "../../lib/accounts/groups";
import { authorizeRequest } from "../../lib/request-access";
import { changeProfile } from "../../lib/profiles";
import { createGroup } from "../../lib/groups";
import { acceptInvitation, credentialHash } from "../../lib/sessions";
let db: DatabaseSync, a: string, b: string, c: string;
const origin="https://watch.example", password="Synthetic account password";
function req(token=a, extra="", context=true) {
  const request=new Request(origin,{method:"POST",headers:{origin,cookie:`${accountCookieName}=${token}; watchnext_access_mode=account${extra ? "; "+extra : ""}`}});
  if(context) try {request.headers.set("x-watchnext-context",requestContext(db,request).contextKey);} catch { /* No group until creation. */ }
  return request;
}
function create(name="Group A", token=a) {return createAccountGroup(db,req(token),name,accountSession(db,req(token)).revision,origin);}
function join(invite:string,token=b) { const intent=beginAccountInvite(db,invite.split("/").at(-1)); const request=req(token,`${pendingInviteCookieName}=${intent}`); return joinAccountGroup(db,request,accountSession(db,request).revision,origin); }
beforeEach(async()=>{db=new DatabaseSync(":memory:");migrate(db);security.signupTotal.clear("all");
  a=(await registerAccount(db,{username:"Account.One",password,confirmation:password})).credential;
  b=(await registerAccount(db,{username:"Account.Two",password,confirmation:password})).credential;
  c=(await registerAccount(db,{username:"Account.Three",password,confirmation:password})).credential;
});
afterEach(()=>db.close());
it("creates fresh owned groups atomically with stable username members, hashed invites and per-session selected context",async()=>{
  const group=create(); expect(group.groups).toHaveLength(1); expect(group.inviteUrl).toMatch(/^https:\/\/watch.example\/invite\/[A-Za-z0-9_-]{43}$/);
  expect(db.prepare("SELECT token_hash FROM invitations").get()?.token_hash).toBe(credentialHash(group.inviteUrl.split("/").at(-1)!));
  const context=requestContext(db,req());expect(context.mode).toBe("account");expect(context.revision).toBe(1);
  expect(db.prepare("SELECT name FROM members WHERE id=?").get(context.activeMemberId!)?.name).toBe("Account.One");
  expect(db.prepare("SELECT * FROM contributors").all()).toEqual([]);
  const second=await loginAccount(db,{username:"Account.One",password});
  expect(accountGroups(db,req(second.credential)).selectedGroupId).toBeNull();
  const group2=create("Group Two"); expect(group2.groups).toHaveLength(2);
  switchAccountGroup(db,req(),group.groups[0].id,group2.revision,origin);
  expect(accountGroups(db,req()).selectedGroupId).toBe(group.groups[0].id);
  expect(accountGroups(db,req(second.credential)).selectedGroupId).toBeNull();
  db.exec("CREATE TRIGGER fixture_fail BEFORE INSERT ON invitations BEGIN SELECT RAISE(ABORT,'synthetic'); END");
  const before=JSON.stringify([db.prepare("SELECT * FROM groups").all(),db.prepare("SELECT * FROM members").all(),db.prepare("SELECT * FROM account_memberships").all(),db.prepare("SELECT * FROM account_sessions").all()]);
  expect(()=>create("Rollback")).toThrow();expect(JSON.stringify([db.prepare("SELECT * FROM groups").all(),db.prepare("SELECT * FROM members").all(),db.prepare("SELECT * FROM account_memberships").all(),db.prepare("SELECT * FROM account_sessions").all()])).toBe(before);
});
it("requires authenticated explicit join/current invitation, retains repeated identity and rolls back failed joins",()=>{
  const group=create(),first=join(group.inviteUrl);const member=requestContext(db,req(b)).activeMemberId;
  const again=join(group.inviteUrl);expect(requestContext(db,req(b)).activeMemberId).toBe(member);expect(again.groups).toHaveLength(1);
  expect(db.prepare("SELECT count(*) AS n FROM members WHERE group_id=?").get(group.selectedGroupId!)?.n).toBe(2);
  const intent=beginAccountInvite(db,group.inviteUrl.split("/").at(-1));const request=req(c,`${pendingInviteCookieName}=${intent}`);
  expect(pendingAccountInvite(db,request)).toEqual({available:true,name:"Group A"});
  db.exec("CREATE TRIGGER fixture_join_fail BEFORE INSERT ON account_memberships BEGIN SELECT RAISE(ABORT,'synthetic'); END");
  expect(()=>joinAccountGroup(db,request,0,origin)).toThrow();expect(db.prepare("SELECT count(*) AS n FROM members").get()?.n).toBe(2);
  expect(()=>joinAccountGroup(db,req("tampered",`${pendingInviteCookieName}=${intent}`),0,origin)).toThrow();
  db.exec("DROP TRIGGER fixture_join_fail");db.prepare("UPDATE invitations SET revoked_at='now'").run();
  expect(()=>joinAccountGroup(db,request,0,origin)).toThrow();expect(first.groups[0].memberId).toBe(member);
});
it("away/back revision, mixed modes and account profile impersonation fail closed",()=>{
  const first=create(),before=req(),second=create("Second");switchAccountGroup(db,req(),first.selectedGroupId,second.revision,origin);
  expect(()=>authorizeRequest(db,before,undefined,{mutation:true,configuredOrigin:origin})).toThrow();
  expect(()=>authorizeRequest(db,req(a,"",false),undefined,{mutation:true,configuredOrigin:origin})).toThrow();
  expect(()=>changeProfile(db,req(),{intent:"create",name:"Impersonate",color:"#1d4ed8"},origin)).toThrow();
  const oldGroup=createGroup(db,"Legacy",origin),legacy=acceptInvitation(db,oldGroup.inviteUrl.split("/").at(-1));
  const mixed=new Request(origin,{headers:{cookie:`${accountCookieName}=${a}; watchnext_session=${legacy}`}});
  expect(()=>requestContext(db,mixed)).toThrow();
  mixed.headers.set("cookie",mixed.headers.get("cookie")+"; watchnext_access_mode=legacy");expect(requestContext(db,mixed).groupName).toBe("Legacy");
  const prior=requestContext(db,mixed).contextKey;useLegacyMode(db,req(a,`watchnext_session=${legacy}`),accountSession(db,req()).revision,origin);
  mixed.headers.set("x-watchnext-context",prior);expect(()=>authorizeRequest(db,mixed)).toThrow();
  logoutAccount(db,a);expect(()=>requestContext(db,req(a,`watchnext_session=${legacy}`))).toThrow();
});
it("removal is live, old generation cannot rejoin and a newer valid invite reactivates the same member",()=>{
  const group=create();join(group.inviteUrl);const member=requestContext(db,req(b)).activeMemberId;
  db.prepare("UPDATE account_memberships SET status='removed',removed_at='now',removed_invite_generation=1 WHERE member_id=?").run(member!);
  expect(()=>requestContext(db,req(b))).toThrow();expect(accountGroups(db,req(b)).groups).toEqual([]);
  expect(()=>join(group.inviteUrl)).toThrow();expect(()=>switchAccountGroup(db,req(b),group.selectedGroupId,accountSession(db,req(b)).revision,origin)).toThrow();
  db.prepare("UPDATE groups SET invite_generation=2 WHERE id=?").run(group.selectedGroupId!);
  expect(()=>beginAccountInvite(db,group.inviteUrl.split("/").at(-1))).toThrow();
  const rotated=randomBytes(32).toString("base64url"); db.prepare("INSERT INTO invitations(id,group_id,token_hash,generation) VALUES ('rotated',?,?,2)").run(group.selectedGroupId!,credentialHash(rotated));join(origin+"/invite/"+rotated);
  expect(requestContext(db,req(b)).activeMemberId).toBe(member);
});
it("expired/tampered pending intents and stale selection claims do not create or disclose membership",()=>{
  const group=create(),intent=beginAccountInvite(db,group.inviteUrl.split("/").at(-1));
  db.prepare("UPDATE pending_group_invitations SET expires_at=0").run();
  const request=req(b,`${pendingInviteCookieName}=${intent}`);expect(pendingAccountInvite(db,request)).toEqual({available:false,name:""});
  expect(()=>joinAccountGroup(db,request,0,origin)).toThrow();expect(()=>createAccountGroup(db,req(),"Stale",0,origin)).toThrow();
  expect(()=>switchAccountGroup(db,req(c),group.selectedGroupId,0,origin)).toThrow();
  expect(accountGroups(db,req(b)).groups).toEqual([]);
});
