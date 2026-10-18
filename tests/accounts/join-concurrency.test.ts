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
import { createAccountGroup,beginAccountInvite,pendingInviteCookieName } from "../../lib/accounts/groups";
import { security } from "../../lib/accounts/security";
it("actual competing join processes commit exactly one stable membership/member and no partial losing state",async()=>{
  const root=mkdtempSync(join(tmpdir(),"watchnext-group-join-race-")),path=join(root,"fixture.sqlite"),db=new DatabaseSync(path),children:ReturnType<typeof spawn>[]=[];
  try{
    migrate(db);security.signupTotal.clear("all");const origin="https://watch.example",password="Synthetic race password";
    const a=await registerAccount(db,{username:"Join.Owner",password,confirmation:password}),b=await registerAccount(db,{username:"Join.Member",password,confirmation:password});
    const request=new Request(origin,{method:"POST",headers:{origin,cookie:`${accountCookieName}=${a.credential}`}}),group=createAccountGroup(db,request,"Race",0,origin);
    const intent=beginAccountInvite(db,group.inviteUrl.split("/").at(-1));
    const jobs=Array.from({length:2},()=>{
      const child=spawn(process.execPath,["--import",new URL("../fixtures/save-resolver.mjs",import.meta.url).href,fileURLToPath(new URL("../fixtures/account-join-worker.mjs",import.meta.url)),new URL("../../lib/accounts/groups.ts",import.meta.url).href,path],{stdio:["pipe","pipe","pipe"],windowsHide:true});children.push(child);let output="";child.stdout!.on("data",value=>output+=value);child.stderr!.resume();
      const ready=new Promise<void>((done,fail)=>{child.stdout!.on("data",()=>{if(output.includes("ready\n"))done();});child.once("error",fail);child.once("exit",()=>{if(!output.includes("ready\n"))fail(new Error("Join worker failed before readiness"));});});
      const ended=new Promise<boolean>((done,fail)=>{child.once("error",fail);child.once("exit",code=>code===0?done(output.includes('"joined":true')):fail(new Error("Owned join worker failed")));});void ended.catch(()=>{});return{child,ready,ended};
    });
    const timer=setTimeout(()=>{for(const child of children)if(child.exitCode===null)child.kill();},10000);
    try{await Promise.all(jobs.map(job=>job.ready));for(const job of jobs)job.child.stdin!.end(JSON.stringify({origin,revision:0,cookie:`${accountCookieName}=${b.credential}; ${pendingInviteCookieName}=${intent}`}));const results=await Promise.all(jobs.map(job=>job.ended));expect(results.filter(Boolean)).toHaveLength(1);}finally{clearTimeout(timer);for(const job of jobs)if(job.child.exitCode===null)job.child.kill();await Promise.allSettled(jobs.map(job=>job.ended));}
    expect(db.prepare("SELECT count(*) AS n FROM account_memberships WHERE group_id=?").get(group.selectedGroupId!)?.n).toBe(2);expect(db.prepare("SELECT count(*) AS n FROM members WHERE group_id=?").get(group.selectedGroupId!)?.n).toBe(2);expect(db.prepare("SELECT * FROM pending_group_invitations").all()).toEqual([]);expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  }finally{db.close();if(dirname(resolve(root))!==resolve(tmpdir())||!basename(root).startsWith("watchnext-group-join-race-"))throw new Error("Unsafe cleanup");rmSync(root,{recursive:true,force:true});}
},15000);
