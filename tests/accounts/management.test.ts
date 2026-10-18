// @vitest-environment node
import { DatabaseSync } from "node:sqlite";
import { beforeEach,afterEach,expect,it } from "vitest";
import { migrate } from "../../db/migrate";
import { registerAccount,loginAccount,accountCookieName } from "../../lib/accounts/service";
import { security } from "../../lib/accounts/security";
import { requestContext,accountSession } from "../../lib/accounts/context";
import { createAccountGroup,beginAccountInvite,joinAccountGroup,pendingInviteCookieName,switchAccountGroup } from "../../lib/accounts/groups";
import { readGroupManagement,removeParticipant,rotateGroupInvite } from "../../lib/accounts/management";
import { saveTitle } from "../../lib/shared-save";
import { readWatchlist } from "../../lib/watchlist";
import { readTitleDetails } from "../../lib/title-details";
import { updateOwnRating } from "../../lib/ratings";
import { updateOwnNote } from "../../lib/notes";
import { updateWatchProgress } from "../../lib/watch-progress";
import { readPickerPage,pickFromForm } from "../../lib/picker/server";
import { beginReview,saveReview,type Providers } from "../../lib/metadata/reviews";
import { createGroup } from "../../lib/groups";
import { acceptInvitation } from "../../lib/sessions";
let db:DatabaseSync,a:string,b:string,c:string,group:string,invite:string,member:string;
const origin="https://watch.example",password="Synthetic management password";
function req(token=a){const request=new Request(origin,{method:"POST",headers:{origin,cookie:`${accountCookieName}=${token}; watchnext_access_mode=account`}});try{request.headers.set("x-watchnext-context",requestContext(db,request).contextKey);}catch{}return request;}
function pending(token:string,url:string){const intent=beginAccountInvite(db,url.split("/").at(-1));const request=req(token);request.headers.set("cookie",request.headers.get("cookie")+`; ${pendingInviteCookieName}=${intent}`);return request;}
function join(token:string,url:string){return joinAccountGroup(db,pending(token,url),accountSession(db,req(token)).revision,origin);}
const fields={title:"Sole contribution",contentType:"movie",minutes:"24",seconds:"0",numberingStyle:"none",genres:"Personal genre",moods:["funny"],watchUrl:""};
const provider:Providers["youtube"]={namespace:"youtube",async lookup(){return{kind:"item",item:{externalId:"YtFixture01",title:"Provider item",contentType:"youtube",duration:{seconds:120,meaning:"full_item",verified:true},genres:[],watchUrl:"https://www.youtube.com/watch?v=YtFixture01"}};}};
const providers:Providers={youtube:provider,kinopoisk_unofficial:{namespace:"kinopoisk_unofficial",async lookup(){return{kind:"failure",code:"network_error"};}}};
const business=()=>JSON.stringify(["titles","contributors","progress","ratings","notes","metadata_fields","title_genres","title_moods","members"].map(table=>db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()));
beforeEach(async()=>{db=new DatabaseSync(":memory:");migrate(db);security.signupTotal.clear("all");for(const key of["manage.owner","manage.member","manage.foreign"])security.signup.clear(key);
  const register=async(username:string)=>(await registerAccount(db,{username,password,confirmation:password})).credential;
  a=await register("Manage.Owner");b=await register("Manage.Member");c=await register("Manage.Foreign");
  const created=createAccountGroup(db,req(),"Managed",0,origin);group=created.selectedGroupId!;invite=created.inviteUrl;join(b,invite);member=requestContext(db,req(b)).activeMemberId!;
});afterEach(()=>db.close());

it("derives live creator authority and denies self, foreign, stale, duplicate/missing cookies, missing/cross origin and mode forgery",()=>{
  expect(readGroupManagement(db,req()).canManage).toBe(true);expect(readGroupManagement(db,req(b)).canManage).toBe(false);
  for(const operation of[()=>removeParticipant(db,req(b),member,1,origin),()=>rotateGroupInvite(db,req(b),1,origin),()=>removeParticipant(db,req(),requestContext(db,req()).activeMemberId,1,origin),()=>removeParticipant(db,req(),"foreign",1,origin)])expect(operation).toThrow();
  const stale=req();switchAccountGroup(db,req(),group,accountSession(db,req()).revision,origin);expect(()=>rotateGroupInvite(db,stale,1,origin)).toThrow();
  for(const change of[(request:Request)=>request.headers.delete("cookie"),(request:Request)=>request.headers.set("cookie",`${accountCookieName}=${a}; ${accountCookieName}=${a}; watchnext_access_mode=account`),(request:Request)=>request.headers.delete("origin"),(request:Request)=>request.headers.set("origin","https://foreign.example"),(request:Request)=>request.headers.set("cookie",`${accountCookieName}=${a}; watchnext_access_mode=legacy`),(request:Request)=>request.headers.delete("x-watchnext-context")]){const request=req();change(request);expect(()=>rotateGroupInvite(db,request,1,origin)).toThrow();}
  const view=readGroupManagement(db,req());expect(view.members.map(value=>value.name)).toContain("Manage.Member");expect(view.members.every(value=>value.status==="active"&&/^#[0-9a-f]{6}$/.test(value.color))).toBe(true);
  createAccountGroup(db,req(c),"Other group",0,origin);expect(()=>removeParticipant(db,req(c),member,1,origin)).toThrow();
  const legacy=createGroup(db,"Separate legacy",origin),credential=acceptInvitation(db,legacy.inviteUrl.split("/").at(-1));
  const legacyRequest=new Request(origin,{method:"POST",headers:{origin,cookie:`watchnext_session=${credential}; watchnext_access_mode=legacy`}});
  expect(()=>readGroupManagement(db,legacyRequest)).toThrow();expect(()=>rotateGroupInvite(db,legacyRequest,1,origin)).toThrow();
});

it("removal preserves sole-contributor business/history, denies both sessions and held results, and never revives stale intents on rejoin",async()=>{
  const second=(await loginAccount(db,{username:"Manage.Member",password})).credential;switchAccountGroup(db,req(second),group,0,origin);
  const saved=saveTitle(db,req(b),{kind:"manual",fields},origin);if(saved.kind!=="created")throw new Error("Expected title");const id=saved.id,claim={groupId:group,memberId:member};
  updateOwnRating(db,req(b),id,{...claim,intent:"save_rating",score:"8"},origin);updateOwnNote(db,req(b),id,{...claim,intent:"save_note",body:"Retain me"},origin);updateWatchProgress(db,req(b),id,{...claim,intent:"save_timestamp",numberingStyle:"none",timestamp:"0:09"},origin);
  const unrelated=(await loginAccount(db,{username:"Manage.Member",password})).credential;
  const other=createAccountGroup(db,req(unrelated),"Unaffected membership",0,origin);
  const old=req(second),review=await beginReview(db,old,"youtube","YtFixture01",providers,origin),before=business();
  const form=new FormData();Object.entries({requestId:"request",groupId:group,availableMinutes:"25",mood:"funny",viewers:member,pageId:"management-cycle",intentId:"start",intent:"start",cursor:""}).forEach(([key,value])=>form.set(key,value));const picked=pickFromForm(db,old,form,origin);expect(picked.kind).toBe("picked");
  let release!:(value:Awaited<ReturnType<typeof provider.lookup>>)=>void,started!:()=>void;const ready=new Promise<void>(resolve=>{started=resolve;}),waiting=new Promise<Awaited<ReturnType<typeof provider.lookup>>>(resolve=>{release=resolve;});
  const held=beginReview(db,old,"youtube","YtFixture01",{...providers,youtube:{namespace:"youtube",async lookup(){started();return waiting;}}},origin).then(()=>"returned",()=>"denied");await ready;
  const removed=removeParticipant(db,req(),member,1,origin);expect(removed.outcome).toBe("removed");expect(business()).toBe(before);expect(removed.members.find(value=>value.id===member)?.status).toBe("removed");
  for(const token of[b,second]){expect(()=>readWatchlist(db,req(token))).toThrow();expect(()=>switchAccountGroup(db,req(token),group,accountSession(db,req(token)).revision,origin)).toThrow();}
  expect(readGroupManagement(db,req(unrelated)).groupId).toBe(other.selectedGroupId);expect(readGroupManagement(db,req(unrelated)).canManage).toBe(true);
  expect(readWatchlist(db,req()).items[0].contributors[0].inactive).toBe(true);expect(readTitleDetails(db,req(),id).history.find(value=>value.id===member)?.inactive).toBe(true);expect(readTitleDetails(db,req(),id).canEdit).toBe(false);expect(readPickerPage(db,req()).members.some(value=>value.id===member)).toBe(false);
  const cutoff=db.prepare("SELECT * FROM account_memberships WHERE member_id=?").get(member);const rotated=rotateGroupInvite(db,req(),1,origin);expect(removeParticipant(db,req(),member,1,origin).outcome).toBe("already_removed");expect(db.prepare("SELECT * FROM account_memberships WHERE member_id=?").get(member)).toEqual(cutoff);
  join(b,rotated.inviteUrl);expect(requestContext(db,req(second)).activeMemberId).toBe(member);expect(()=>removeParticipant(db,req(),member,1,origin)).toThrow();
  expect(()=>updateOwnRating(db,old,id,{...claim,intent:"save_rating",score:"9"},origin)).toThrow();expect(()=>saveReview(db,req(second),review.handle,{...fields,title:"Stale",contentType:"youtube"},"","",undefined,origin)).toThrow();
  form.set("intent","next");form.set("intentId","next");if("cursor" in picked)form.set("cursor",picked.cursor!);expect(pickFromForm(db,req(second),form,origin).kind).toBe("conflict");
  release(await provider.lookup({kind:"detail",externalId:"YtFixture01"},{}));expect(await held).toBe("denied");expect(business()).toBe(before);
  updateOwnRating(db,req(second),id,{...claim,intent:"save_rating",score:"7"},origin);expect(readTitleDetails(db,req(),id).history.find(value=>value.id===member)?.rating).toBe(7);
});

it("rotation-before-removal links/pending remain barred; only a post-removal generation restores the same member",()=>{
  const firstPending=pending(c,invite),rotatedBefore=rotateGroupInvite(db,req(),1,origin);expect(()=>joinAccountGroup(db,firstPending,0,origin)).toThrow();expect(()=>beginAccountInvite(db,invite.split("/").at(-1))).toThrow();expect(readWatchlist(db,req(b)).items).toEqual([]);
  const discoveredBefore=pending(b,rotatedBefore.inviteUrl);removeParticipant(db,req(),member,1,origin);
  const discoveredAfter=pending(b,rotatedBefore.inviteUrl);
  for(const request of[discoveredBefore,discoveredAfter])expect(()=>joinAccountGroup(db,request,accountSession(db,req(b)).revision,origin)).toThrow();
  const cutoff=db.prepare("SELECT removed_invite_generation,removed_at FROM account_memberships WHERE member_id=?").get(member);expect(cutoff?.removed_invite_generation).toBe(2);
  const latest=rotateGroupInvite(db,req(),2,origin);expect(()=>rotateGroupInvite(db,req(),2,origin)).toThrow();expect(removeParticipant(db,req(),member,1,origin).outcome).toBe("already_removed");expect(db.prepare("SELECT removed_invite_generation,removed_at FROM account_memberships WHERE member_id=?").get(member)).toEqual(cutoff);
  expect(()=>joinAccountGroup(db,discoveredAfter,accountSession(db,req(b)).revision,origin)).toThrow();join(b,latest.inviteUrl);expect(requestContext(db,req(b)).activeMemberId).toBe(member);expect(db.prepare("SELECT count(*) AS n FROM members WHERE group_id=?").get(group)?.n).toBe(2);
});

it("storage errors and generation overflow roll back removal/rotation without partial state or a false link",()=>{
  const snapshot=()=>JSON.stringify(["groups","invitations","account_memberships"].map(table=>db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()));const before=snapshot();
  db.exec("CREATE TRIGGER fixture_remove BEFORE UPDATE OF status ON account_memberships BEGIN SELECT RAISE(ABORT,'fixture'); END");expect(()=>removeParticipant(db,req(),member,1,origin)).toThrow();expect(snapshot()).toBe(before);db.exec("DROP TRIGGER fixture_remove");
  db.exec("CREATE TRIGGER fixture_rotate BEFORE INSERT ON invitations BEGIN SELECT RAISE(ABORT,'fixture'); END");expect(()=>rotateGroupInvite(db,req(),1,origin)).toThrow();expect(snapshot()).toBe(before);db.exec("DROP TRIGGER fixture_rotate");
  db.prepare("UPDATE groups SET invite_generation=2147483647 WHERE id=?").run(group);const overflow=snapshot();expect(()=>rotateGroupInvite(db,req(),2147483647,origin)).toThrow();expect(snapshot()).toBe(overflow);expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
});
