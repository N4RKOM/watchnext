// @vitest-environment node
import { DatabaseSync } from "node:sqlite";
import { beforeEach, afterEach, expect, it } from "vitest";
import { migrate } from "../../db/migrate";
import { credentialHash } from "../../lib/sessions";
import { registerAccount, loginAccount, accountCookieName, logoutAccount } from "../../lib/accounts/service";
import { security } from "../../lib/accounts/security";
import { requestContext, accountSession } from "../../lib/accounts/context";
import { createAccountGroup, beginAccountInvite, joinAccountGroup, pendingInviteCookieName, switchAccountGroup } from "../../lib/accounts/groups";
import { saveTitle } from "../../lib/shared-save";
import { readWatchlist } from "../../lib/watchlist";
import { readTitleDetails } from "../../lib/title-details";
import { readSavedTitle } from "../../lib/manual-titles";
import { readEditableTitle } from "../../lib/edit-title";
import { removeOwnContribution, restoreTitle } from "../../lib/contributions";
import { readOwnWatchProgress, updateWatchProgress } from "../../lib/watch-progress";
import { readOwnEpisodeProgress, updateEpisodeProgress } from "../../lib/episode-progress";
import { readOwnRating, updateOwnRating } from "../../lib/ratings";
import { readOwnNote, updateOwnNote } from "../../lib/notes";
import { readPickerPage, pickFromForm } from "../../lib/picker/server";
import { beginReview, saveReview, selectReviewCandidate, refreshTitleMetadata, type Providers } from "../../lib/metadata/reviews";
let db: DatabaseSync, a:string,b:string,c:string,g1:string,g2:string,movie:string,series:string,foreign:string;
const origin="https://watch.example", password="Synthetic account password";
function req(token=a) { const request=new Request(origin,{method:"POST",headers:{origin,cookie:`${accountCookieName}=${token}; watchnext_access_mode=account`}});try {request.headers.set("x-watchnext-context",requestContext(db,request).contextKey);}catch{} return request; }
function join(token:string,invite:string) { const intent=beginAccountInvite(db,invite.split("/").at(-1)),request=req(token);request.headers.set("cookie",request.headers.get("cookie")+`; ${pendingInviteCookieName}=${intent}`);return joinAccountGroup(db,request,accountSession(db,request).revision,origin); }
function switchTo(token:string,group:string) {return switchAccountGroup(db,req(token),group,accountSession(db,req(token)).revision,origin);}
const fields=(title="Movie",type="movie")=>({title,contentType:type,minutes:"24",seconds:"0",numberingStyle:type==="series"?"continuous":"none",genres:"",moods:["funny"],watchUrl:""});
function saved(token:string,title:string,type="movie") {const result=saveTitle(db,req(token),{kind:"manual",fields:fields(title,type)},origin);if(result.kind!=="created")throw new Error("Expected created");return result.id;}
const member=(token:string)=>requestContext(db,req(token)).activeMemberId!;
const claims=(token=b)=>({groupId:g1,memberId:member(token)});
function pickForm(token=b) {const form=new FormData();Object.entries({requestId:"request-1",groupId:g1,availableMinutes:"25",mood:"funny"}).forEach(([key,value])=>form.set(key,value));form.append("viewers",member(token));return form;}
const provider: Providers["youtube"]={namespace:"youtube",async lookup(){return {kind:"item",item:{externalId:"YtFixture01",title:"Provider fixture",contentType:"youtube",duration:{seconds:120,meaning:"full_item",verified:true},genres:[],watchUrl:"https://www.youtube.com/watch?v=YtFixture01"}};}};
const providers:Providers={youtube:provider,kinopoisk_unofficial:{namespace:"kinopoisk_unofficial",async lookup(){return{kind:"failure",code:"network_error"};}}};
beforeEach(async()=>{
  db=new DatabaseSync(":memory:");migrate(db);security.signupTotal.clear("all");
  for(const name of ["consumer.a","consumer.b","consumer.c"])security.signup.clear(name);
  const register=async(username:string)=>(await registerAccount(db,{username,password,confirmation:password})).credential;
  a=await register("Consumer.A");b=await register("Consumer.B");c=await register("Consumer.C");
  const one=createAccountGroup(db,req(a),"Group One",0,origin);g1=one.selectedGroupId!;join(b,one.inviteUrl);
  const two=createAccountGroup(db,req(c),"Group Two",0,origin);g2=two.selectedGroupId!;foreign=saved(c,"Private film");join(a,two.inviteUrl);switchTo(a,g1);
  movie=saved(b,"Movie");series=saved(b,"Series","series");
});
afterEach(()=>db.close());
it("derives account own-history identity, permits shared browsing and duplicate contribution, never gives owner contributor authority",()=>{
  expect(readWatchlist(db,req(a)).items).toHaveLength(2);expect(readTitleDetails(db,req(a),movie).canEdit).toBe(false);expect(()=>readEditableTitle(db,req(a),movie)).toThrow();
  updateOwnRating(db,req(a),movie,{...claims(a),intent:"save_rating",score:"8"},origin);
  updateOwnNote(db,req(a),movie,{...claims(a),intent:"save_note",body:"Own account note"},origin);
  updateWatchProgress(db,req(a),movie,{...claims(a),intent:"save_timestamp",numberingStyle:"none",timestamp:"0:09"},origin);
  updateEpisodeProgress(db,req(a),series,{...claims(a),intent:"save_position",numberingStyle:"continuous",positionState:"in_progress",nextEpisode:"3"},origin);
  expect(db.prepare("SELECT member_id FROM ratings").get()?.member_id).toBe(member(a));
  expect(()=>updateOwnRating(db,req(b),movie,{...claims(a),intent:"save_rating",score:"1"},origin)).toThrow();
  expect(()=>updateOwnNote(db,req(b),movie,{...claims(a),intent:"save_note",body:"Forge"},origin)).toThrow();
  expect(()=>updateWatchProgress(db,req(b),movie,{...claims(a),intent:"complete",numberingStyle:"none"},origin)).toThrow();
  expect(()=>updateEpisodeProgress(db,req(b),series,{...claims(a),intent:"complete",numberingStyle:"continuous"},origin)).toThrow();
  const confirmation=saveTitle(db,req(a),{kind:"manual",fields:fields()},origin);expect(confirmation.kind).toBe("confirmation_required");
  saveTitle(db,req(a),{kind:"manual",fields:fields(),confirmationId:movie},origin);expect(readEditableTitle(db,req(a),movie).values.title).toBe("Movie");
  removeOwnContribution(db,req(a),movie,claims(a),origin);expect(readTitleDetails(db,req(a),movie).canEdit).toBe(false);
});
it("all selected-group reads/mutations reject a known foreign record even if that account belongs to its other group",async()=>{
  const before=JSON.stringify(db.prepare("SELECT * FROM titles ORDER BY id").all());
  for(const read of [readTitleDetails,readSavedTitle,readEditableTitle,readOwnWatchProgress,readOwnRating,readOwnNote])expect(()=>read(db,req(a),foreign)).toThrow();
  expect(()=>removeOwnContribution(db,req(a),foreign,claims(a),origin)).toThrow();expect(()=>restoreTitle(db,req(a),foreign,claims(a),origin)).toThrow();
  await expect(refreshTitleMetadata(db,req(a),foreign,providers,origin)).rejects.toThrow();
  expect(JSON.stringify(db.prepare("SELECT * FROM titles ORDER BY id").all())).toBe(before);
});
it("removed membership immediately blocks every consumer category without modifying history or invoking providers",async()=>{
  const request=req(b), claim=claims(), form=pickForm(), before=JSON.stringify(["titles","contributors","progress","ratings","notes"].map(table=>db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()));
  db.prepare("UPDATE account_memberships SET status='removed',removed_at='now',removed_invite_generation=1 WHERE member_id=?").run(claim.memberId);
  for(const operation of [()=>readWatchlist(db,request),()=>readWatchlist(db,request,true),()=>readTitleDetails(db,request,movie),()=>readSavedTitle(db,request,movie),()=>readEditableTitle(db,request,movie),()=>readOwnWatchProgress(db,request,movie),()=>readOwnEpisodeProgress(db,request,series),()=>readOwnRating(db,request,movie),()=>readOwnNote(db,request,movie),()=>readPickerPage(db,request),()=>pickFromForm(db,request,form,origin),()=>saveTitle(db,request,{kind:"manual",fields:fields("Denied")},origin),()=>removeOwnContribution(db,request,movie,claim,origin),()=>restoreTitle(db,request,movie,claim,origin),()=>updateOwnRating(db,request,movie,{...claim,intent:"save_rating",score:"1"},origin),()=>updateOwnNote(db,request,movie,{...claim,intent:"save_note",body:"Denied"},origin),()=>updateWatchProgress(db,request,movie,{...claim,intent:"complete",numberingStyle:"none"},origin),()=>updateEpisodeProgress(db,request,series,{...claim,intent:"complete",numberingStyle:"continuous"},origin),()=>saveReview(db,request,"x".repeat(43),fields(),"","",undefined,origin)])expect(operation).toThrow();
  let calls=0;const blocked:Providers={...providers,youtube:{namespace:"youtube",async lookup(){calls++;return{kind:"failure",code:"network_error"};}}};
  await expect(beginReview(db,request,"youtube","YtFixture01",blocked,origin)).rejects.toThrow();await expect(selectReviewCandidate(db,request,"x".repeat(43),"1001",blocked,origin)).rejects.toThrow();await expect(refreshTitleMetadata(db,request,movie,blocked,origin)).rejects.toThrow();expect(calls).toBe(0);
  expect(JSON.stringify(["titles","contributors","progress","ratings","notes"].map(table=>db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()))).toBe(before);
  expect(readWatchlist(db,req(a)).items).toHaveLength(2);expect(readPickerPage(db,req(a)).members.map(member=>member.id)).not.toContain(claim.memberId);
  expect(readTitleDetails(db,req(a),movie).contributors.map(member=>member.id)).toContain(claim.memberId);
});
it("away/back invalidates captured mutations, review handles and picker cursors while fresh contexts work",async()=>{
  const request=req(a),review=await beginReview(db,request,"youtube","YtFixture01",providers,origin);expect(review.handle).toBeTruthy();
  const form=pickForm(a);form.set("pageId","page-context");form.set("intentId","intent-context");form.set("intent","start");form.set("cursor","");const pick=pickFromForm(db,request,form,origin);expect(pick.kind).toBe("picked");
  switchTo(a,g2);switchTo(a,g1);
  expect(()=>saveTitle(db,request,{kind:"manual",fields:fields("Stale")},origin)).toThrow();expect(()=>saveReview(db,req(a),review.handle,fields("Provider fixture","youtube"),"","",undefined,origin)).toThrow();
  expect(()=>pickFromForm(db,request,form,origin)).toThrow();
  form.set("intent","next");form.set("intentId","next-context");if("cursor" in pick)form.set("cursor",pick.cursor!);expect(pickFromForm(db,req(a),form,origin).kind).toBe("conflict");
  expect(saveTitle(db,req(a),{kind:"manual",fields:fields("Fresh")},origin).kind).toBe("created");
});
it("provider completion after membership removal or session revocation returns no private result/review",async()=>{
  for(const change of [()=>db.prepare("UPDATE account_memberships SET status='removed',removed_at='now',removed_invite_generation=1 WHERE member_id=?").run(member(b)),()=>logoutAccount(db,b)]){
    let release!:(value:Awaited<ReturnType<typeof provider.lookup>>)=>void,started!:()=>void;
    const ready=new Promise<void>(resolve=>{started=resolve;});const waiting=new Promise<Awaited<ReturnType<typeof provider.lookup>>>(resolve=>{release=resolve;});
    const delayed:Providers={...providers,youtube:{namespace:"youtube",async lookup(){started();return waiting;}}};
    const pending=beginReview(db,req(b),"youtube","YtFixture01",delayed,origin);const rejection=expect(pending).rejects.toThrow();await ready;change();release(await provider.lookup({kind:"detail",externalId:"YtFixture01"},{}));await rejection;
    expect(db.prepare("SELECT * FROM metadata_reviews").all()).toEqual([]);
    db.prepare("UPDATE groups SET invite_generation=2 WHERE id=?").run(g1);
    db.exec("UPDATE account_memberships SET status='active',joined_invite_generation=2,removed_at=NULL,removed_invite_generation=NULL WHERE status='removed'");
  }
});

it("another session's rejoin cannot revive old mutations, reviews, cycles or pending provider work",async()=>{
  const second=(await loginAccount(db,{username:"Consumer.B",password})).credential;
  switchTo(second,g1);
  const old=req(second),oldContext=requestContext(db,old),claim=claims(second);
  const review=await beginReview(db,old,"youtube","YtFixture01",providers,origin);
  const form=pickForm(second);form.set("pageId","lifecycle-page");form.set("intentId","lifecycle-start");form.set("intent","start");form.set("cursor","");
  const pick=pickFromForm(db,old,form,origin);expect(pick.kind).toBe("picked");
  let release!:(value:Awaited<ReturnType<typeof provider.lookup>>)=>void,started!:()=>void;
  const ready=new Promise<void>(resolve=>{started=resolve;}),waiting=new Promise<Awaited<ReturnType<typeof provider.lookup>>>(resolve=>{release=resolve;});
  const delayed:Providers={...providers,youtube:{namespace:"youtube",async lookup(){started();return waiting;}}};
  const pending=beginReview(db,old,"youtube","YtFixture01",delayed,origin);
  // Attach a rejection observer before releasing the provider, without hiding unexpected success.
  const outcome=pending.then(()=>"returned",()=>"denied");await ready;
  const sessionBefore=db.prepare("SELECT * FROM account_sessions WHERE token_hash=?").get(credentialHash(second));
  const historyBefore=JSON.stringify(["progress","ratings","notes"].map(table=>db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()));
  db.prepare("UPDATE account_memberships SET status='removed',removed_at='now',removed_invite_generation=1 WHERE member_id=?").run(claim.memberId);
  expect(()=>readWatchlist(db,old)).toThrow();
  db.prepare("UPDATE groups SET invite_generation=2 WHERE id=?").run(g1);
  // A real join through the first browser, leaving the second browser's session row unchanged.
  const invite=Buffer.alloc(32,73).toString("base64url");db.prepare("INSERT INTO invitations(id,group_id,token_hash,generation) VALUES ('lifecycle-invite',?,?,2)").run(g1,credentialHash(invite));
  join(b,origin+"/invite/"+invite);
  expect(db.prepare("SELECT * FROM account_sessions WHERE token_hash=?").get(credentialHash(second))).toEqual(sessionBefore);
  expect(()=>updateOwnRating(db,old,movie,{...claim,intent:"save_rating",score:"9"},origin)).toThrow();
  expect(()=>saveReview(db,req(second),review.handle,fields("Old provider","youtube"),"","",undefined,origin)).toThrow();
  expect(()=>pickFromForm(db,old,form,origin)).toThrow();
  form.set("intent","next");form.set("intentId","lifecycle-next");if("cursor" in pick)form.set("cursor",pick.cursor!);
  expect(pickFromForm(db,req(second),form,origin).kind).toBe("conflict");
  release(await provider.lookup({kind:"detail",externalId:"YtFixture01"},{}));expect(await outcome).toBe("denied");
  expect(db.prepare("SELECT count(*) AS n FROM metadata_reviews").get()?.n).toBe(1);
  expect(JSON.stringify(["progress","ratings","notes"].map(table=>db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()))).toBe(historyBefore);
  expect(requestContext(db,req(second)).activeMemberId).toBe(claim.memberId);
  expect(requestContext(db,req(second)).contextKey).not.toBe(oldContext.contextKey);
  expect(readWatchlist(db,req(second)).items).toHaveLength(2);
  updateOwnRating(db,req(second),movie,{...claim,intent:"save_rating",score:"7"},origin);
  expect(db.prepare("SELECT score FROM ratings WHERE title_id=? AND member_id=?").get(movie,claim.memberId)?.score).toBe(7);
  expect((await beginReview(db,req(second),"youtube","YtFixture01",providers,origin)).handle).toBeTruthy();
});

it("pending provider results stay invalid after switching away, including away and back",async()=>{
  for(const back of [false,true]){
    switchTo(a,g1);const captured=req(a);
    let release!:(value:Awaited<ReturnType<typeof provider.lookup>>)=>void,started!:()=>void;
    const ready=new Promise<void>(resolve=>{started=resolve;}),waiting=new Promise<Awaited<ReturnType<typeof provider.lookup>>>(resolve=>{release=resolve;});
    const delayed:Providers={...providers,youtube:{namespace:"youtube",async lookup(){started();return waiting;}}};
    const outcome=beginReview(db,captured,"youtube","YtFixture01",delayed,origin).then(()=>"returned",()=>"denied");
    await ready;switchTo(a,g2);if(back)switchTo(a,g1);
    release(await provider.lookup({kind:"detail",externalId:"YtFixture01"},{}));expect(await outcome).toBe("denied");
    expect(db.prepare("SELECT count(*) AS n FROM metadata_reviews").get()?.n).toBe(0);
  }
});
