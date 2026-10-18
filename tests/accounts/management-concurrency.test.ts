// @vitest-environment node
import { spawn } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync,rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename,dirname,join,resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect,it } from "vitest";
import { migrate } from "../../db/migrate";
import { registerAccount,accountCookieName } from "../../lib/accounts/service";
import { security } from "../../lib/accounts/security";
import { requestContext,accountSession } from "../../lib/accounts/context";
import { createAccountGroup,beginAccountInvite,pendingInviteCookieName,joinAccountGroup } from "../../lib/accounts/groups";
import { rotateGroupInvite } from "../../lib/accounts/management";
it("actual competing rotation/removal/join processes serialize generation and lifecycle transitions without partial writes",async()=>{
  const root=mkdtempSync(join(tmpdir(),"watchnext-management-race-")),path=join(root,"fixture.sqlite"),db=new DatabaseSync(path);
  const origin="https://watch.example",password="Synthetic management race password";
  async function race(jobs:Record<string,unknown>[]){
    const children=jobs.map(job=>{const child=spawn(process.execPath,["--import",new URL("../fixtures/save-resolver.mjs",import.meta.url).href,fileURLToPath(new URL("../fixtures/management-worker.mjs",import.meta.url)),new URL("../../lib/accounts/management.ts",import.meta.url).href,new URL("../../lib/accounts/groups.ts",import.meta.url).href,path],{stdio:["pipe","pipe","pipe"],windowsHide:true});let output="";child.stdout!.on("data",value=>output+=value);child.stderr!.resume();
      const ready=new Promise<void>((done,fail)=>{child.stdout!.on("data",()=>{if(output.includes("ready\n"))done();});child.once("error",fail);child.once("exit",()=>{if(!output.includes("ready\n"))fail(new Error("Management worker failed before readiness"));});});
      const ended=new Promise<boolean>((done,fail)=>{child.once("error",fail);child.once("exit",code=>code===0?done(output.includes('"committed":true')):fail(new Error("Owned management worker failed")));});void ended.catch(()=>{});return{child,ready,ended,job};});
    const timer=setTimeout(()=>{for(const item of children)if(item.child.exitCode===null)item.child.kill();},10000);
    try{await Promise.all(children.map(item=>item.ready));for(const item of children)item.child.stdin!.end(JSON.stringify({...item.job,origin}));return await Promise.all(children.map(item=>item.ended));}
    finally{clearTimeout(timer);for(const item of children)if(item.child.exitCode===null)item.child.kill();await Promise.allSettled(children.map(item=>item.ended));}
  }
  try{
    migrate(db);security.signupTotal.clear("all");const owner=await registerAccount(db,{username:"Race.Creator",password,confirmation:password}),member=await registerAccount(db,{username:"Race.Participant",password,confirmation:password});
    const request=(token:string)=>{const req=new Request(origin,{method:"POST",headers:{origin,cookie:`${accountCookieName}=${token}; watchnext_access_mode=account`}});try{req.headers.set("x-watchnext-context",requestContext(db,req).contextKey);}catch{}return req;};
    const created=createAccountGroup(db,request(owner.credential),"Race",0,origin),intent=beginAccountInvite(db,created.inviteUrl.split("/").at(-1)),joining=request(member.credential);joining.headers.set("cookie",joining.headers.get("cookie")+`; ${pendingInviteCookieName}=${intent}`);joinAccountGroup(db,joining,0,origin);
    const group=created.selectedGroupId!,target=requestContext(db,request(member.credential)).activeMemberId!,ownerContext=requestContext(db,request(owner.credential)).contextKey,ownerCookie=request(owner.credential).headers.get("cookie")!;
    const rotate={operation:"rotate",cookie:ownerCookie,contextKey:ownerContext,generation:1};expect((await race([rotate,rotate])).filter(Boolean)).toHaveLength(1);expect(db.prepare("SELECT invite_generation FROM groups WHERE id=?").get(group)?.invite_generation).toBe(2);expect(db.prepare("SELECT count(*) AS n FROM invitations WHERE group_id=? AND revoked_at IS NULL").get(group)?.n).toBe(1);
    const remove={operation:"remove",cookie:ownerCookie,contextKey:ownerContext,generation:1,memberId:target};expect(await race([remove,remove])).toEqual([true,true]);expect(db.prepare("SELECT removed_invite_generation FROM account_memberships WHERE member_id=?").get(target)?.removed_invite_generation).toBe(2);
    const rotated=rotateGroupInvite(db,request(owner.credential),2,origin),pending=beginAccountInvite(db,rotated.inviteUrl.split("/").at(-1));
    const joinJob={operation:"join",cookie:request(member.credential).headers.get("cookie")+`; ${pendingInviteCookieName}=${pending}`,revision:accountSession(db,request(member.credential)).revision};const outcomes=await race([joinJob,remove]);expect(outcomes[0]).toBe(true);expect(db.prepare("SELECT status,joined_invite_generation FROM account_memberships WHERE member_id=?").get(target)).toMatchObject({status:"active",joined_invite_generation:3});
    expect(db.prepare("SELECT count(*) AS n FROM members WHERE group_id=?").get(group)?.n).toBe(2);expect(db.prepare("SELECT * FROM pending_group_invitations").all()).toEqual([]);expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  }finally{db.close();if(dirname(resolve(root))!==resolve(tmpdir())||!basename(root).startsWith("watchnext-management-race-"))throw new Error("Unsafe cleanup");rmSync(root,{recursive:true,force:true});}
},20000);
