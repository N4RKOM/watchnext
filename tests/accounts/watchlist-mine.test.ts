// @vitest-environment node
import{DatabaseSync}from"node:sqlite";
import{beforeEach,afterEach,expect,it}from"vitest";
import{migrate}from"../../db/migrate";
import{registerAccount,accountCookieName}from"../../lib/accounts/service";
import{security}from"../../lib/accounts/security";
import{requestContext,accountSession}from"../../lib/accounts/context";
import{createAccountGroup,beginAccountInvite,joinAccountGroup,pendingInviteCookieName,switchAccountGroup}from"../../lib/accounts/groups";
import{removeParticipant}from"../../lib/accounts/management";
import{saveTitle}from"../../lib/shared-save";
import{readWatchlist}from"../../lib/watchlist";
import{removeOwnContribution,restoreTitle}from"../../lib/contributions";
import{updateOwnRating}from"../../lib/ratings";
import{updateOwnNote}from"../../lib/notes";
import{updateWatchProgress}from"../../lib/watch-progress";
import{createGroup}from"../../lib/groups";
import{acceptInvitation,credentialHash}from"../../lib/sessions";
import{readPickerPage,pickFromForm}from"../../lib/picker/server";
let db:DatabaseSync,a:string,b:string,group:string,other:string,own:string,sole:string,joint:string,provider:string,foreign:string;
const origin="https://watch.example",password="Synthetic Mine password";
function req(token=a,url=origin){const request=new Request(url,{method:"POST",headers:{origin,cookie:`${accountCookieName}=${token}; watchnext_access_mode=account`}});try{request.headers.set("x-watchnext-context",requestContext(db,request).contextKey);}catch{}return request;}
const member=(token=a)=>requestContext(db,req(token)).activeMemberId!;
function join(token:string,invite:string){const intent=beginAccountInvite(db,invite.split("/").at(-1)),request=req(token);request.headers.set("cookie",request.headers.get("cookie")+`; ${pendingInviteCookieName}=${intent}`);joinAccountGroup(db,request,accountSession(db,request).revision,origin);}
const fields=(title:string)=>({title,contentType:"movie",minutes:"20",seconds:"0",numberingStyle:"none",genres:"Drama",moods:["funny"],watchUrl:""});
function save(token:string,title:string){const value=saveTitle(db,req(token),{kind:"manual",fields:fields(title)},origin);if(value.kind!=="created")throw new Error("Expected new fixture");return value.id;}
const ids=(token=a,filter:unknown="mine")=>readWatchlist(db,req(token),false,filter).items.map(item=>item.id).sort();
const snapshot=()=>JSON.stringify(["titles","title_moods","title_genres","contributors","members","progress","ratings","notes","metadata_fields","account_sessions"].map(table=>db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()));
function switchTo(token:string,id:string){switchAccountGroup(db,req(token),id,accountSession(db,req(token)).revision,origin);}
beforeEach(async()=>{
 db=new DatabaseSync(":memory:");migrate(db);security.signupTotal.clear("all");for(const name of["mine.a","mine.b"])security.signup.clear(name);
 a=(await registerAccount(db,{username:"Mine.A",password,confirmation:password})).credential;b=(await registerAccount(db,{username:"Mine.B",password,confirmation:password})).credential;
 const one=createAccountGroup(db,req(),"Shared",0,origin);group=one.selectedGroupId!;join(b,one.inviteUrl);own=save(a,"Own manual");sole=save(b,"Other sole");joint=save(a,"Joint manual");saveTitle(db,req(b),{kind:"manual",fields:fields("Joint manual"),confirmationId:joint},origin);
 const imported=saveTitle(db,req(),{kind:"provider",fields:{...fields("Imported video"),contentType:"youtube"},provider:{namespace:"youtube",externalId:"YtFixture01",coverUrl:"https://i.ytimg.com/vi/YtFixture01/default.jpg"}},origin);if(imported.kind!=="created")throw new Error("Expected imported fixture");provider=imported.id;
 const two=createAccountGroup(db,req(b),"Other",accountSession(db,req(b)).revision,origin);other=two.selectedGroupId!;foreign=save(b,"Foreign secret");join(a,two.inviteUrl);switchTo(a,group);switchTo(b,group);
});
afterEach(()=>db.close());
it("Mine selects actual owned contributions once, including provider rows, with every joint name/color",()=>{
 expect(readWatchlist(db,req()).filter).toBe("all");expect(ids(a,"all")).toEqual([own,sole,joint,provider].sort());expect(ids()).toEqual([own,joint,provider].sort());expect(ids(b)).toEqual([sole,joint].sort());
 const item=readWatchlist(db,req(),false,"mine").items.find(item=>item.id===joint)!;expect(item.contributors.map(value=>value.name).sort()).toEqual(["Mine.A","Mine.B"]);expect(item.contributors.every(value=>/^#[0-9a-f]{6}$/.test(value.color))).toBe(true);expect(item.moods).toEqual(["Funny"]);
});
it("creator privileges and personal history do not imply added-by-me ownership",()=>{
 const claims={groupId:group,memberId:member()};updateOwnRating(db,req(),sole,{...claims,intent:"save_rating",score:"8"},origin);updateOwnNote(db,req(),sole,{...claims,intent:"save_note",body:"My own note"},origin);updateWatchProgress(db,req(),sole,{...claims,intent:"save_timestamp",numberingStyle:"none",timestamp:"1:01"},origin);expect(ids()).not.toContain(sole);expect(ids(a,"all")).toContain(sole);
});
it("own removal, final archive and restore change only inclusion and retain the exact ID/history",()=>{
 const claims={groupId:group,memberId:member()};updateOwnRating(db,req(),joint,{...claims,intent:"save_rating",score:"9"},origin);const history=JSON.stringify(db.prepare("SELECT * FROM ratings WHERE title_id=?").all(joint));removeOwnContribution(db,req(),joint,{},origin);expect(ids()).not.toContain(joint);expect(ids(b)).toContain(joint);expect(ids(a,"all")).toContain(joint);removeOwnContribution(db,req(b),joint,{},origin);expect(ids(a,"all")).not.toContain(joint);expect(readWatchlist(db,req(),true,"mine").items.map(item=>item.id)).toContain(joint);expect(readWatchlist(db,req(),true,"mine").canFilter).toBeUndefined();restoreTitle(db,req(),joint,{},origin);expect(ids()).toContain(joint);expect(JSON.stringify(db.prepare("SELECT * FROM ratings WHERE title_id=?").all(joint))).toBe(history);
});
it("removed members retain joint and sole attribution but lose both views immediately",()=>{
 const removed=member(b);removeParticipant(db,req(),removed,1,origin);for(const filter of["all","mine"])expect(()=>readWatchlist(db,req(b),false,filter)).toThrow();const all=readWatchlist(db,req());expect(all.items.find(item=>item.id===sole)?.contributors).toMatchObject([{id:removed,inactive:true}]);expect(readWatchlist(db,req(),false,"mine").items.find(item=>item.id===joint)?.contributors.find(value=>value.id===removed)?.inactive).toBe(true);expect(ids()).not.toContain(sole);
});
it("switch/revisit uses only current membership and rejects stale bound context instead of another group",()=>{
 const stale=req();switchTo(a,other);expect(ids()).toEqual([]);expect(ids(a,"all")).toEqual([foreign]);expect(()=>readWatchlist(db,stale,false,"mine")).toThrow();switchTo(a,group);expect(()=>readWatchlist(db,stale,false,"mine")).toThrow();expect(ids()).toEqual([own,joint,provider].sort());
});
it("URL claims are ignored and missing/forged/duplicate/expired sessions never return misleading empty Mine",()=>{
 const request=req(a,origin+`/watchlist?filter=mine&memberId=${member(b)}&groupId=${other}&accountId=forged`);expect(readWatchlist(db,request,false,"mine").items.map(item=>item.id).sort()).toEqual(ids());
 for(const cookie of["",`${accountCookieName}=forged; watchnext_access_mode=account`,`${accountCookieName}=${a}; ${accountCookieName}=${b}; watchnext_access_mode=account`,`${accountCookieName}=${a}; watchnext_access_mode=account; watchnext_access_mode=legacy`])expect(()=>readWatchlist(db,new Request(origin,{headers:{cookie}}),false,"mine")).toThrow();
 db.prepare("UPDATE account_sessions SET expires_at=created_at+1 WHERE token_hash=?").run(credentialHash(a));expect(()=>readWatchlist(db,req(),false,"mine")).toThrow();
});
it("unsupported filters show safe All, while legacy Mine shows shared All without account controls",()=>{
 for(const value of["unknown",["mine","mine"],"mine' OR 1=1--"]){const view=readWatchlist(db,req(),false,value);expect(view.filter).toBe("all");expect(view.filterNotice).toContain("not supported");expect(view.items.map(item=>item.id).sort()).toEqual(ids(a,"all"));}
 const legacy=acceptInvitation(db,createGroup(db,"Legacy",origin).inviteUrl.split("/").at(-1)!);const view=readWatchlist(db,new Request(origin,{headers:{cookie:`watchnext_session=${legacy}; watchnext_access_mode=legacy`}}),false,"mine");expect(view.items).toEqual([]);expect(view.canFilter).toBeUndefined();expect(view.filterNotice).toContain("account groups only");
});
it("pure filter reads leave all business/profile/provenance/session and actual picker input/result unchanged",()=>{
 const picker=readPickerPage(db,req());const form=new FormData();for(const[key,value]of Object.entries({requestId:"same-read-check",groupId:group,availableMinutes:"25",mood:"funny"}))form.set(key,value);form.append("viewers",member());const beforePick=pickFromForm(db,req(),form,origin);expect(beforePick.kind).toBe("picked");const before=snapshot();for(const token of[a,b])for(const filter of[undefined,"all","mine",["mine","all"]])readWatchlist(db,req(token),false,filter);expect(snapshot()).toBe(before);expect(readPickerPage(db,req())).toEqual(picker);expect(pickFromForm(db,req(),form,origin)).toEqual(beforePick);expect(snapshot()).toBe(before);
});
