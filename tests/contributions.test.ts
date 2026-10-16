// @vitest-environment node
import { DatabaseSync } from "node:sqlite";
import { beforeEach, afterEach, expect, it } from "vitest";
import { migrate } from "../db/migrate";
import { createGroup } from "../lib/groups";
import { acceptInvitation, requireSession, sessionCookieName, credentialHash } from "../lib/sessions";
import { changeProfile } from "../lib/profiles";
import { saveTitle } from "../lib/shared-save";
import { removeOwnContribution, restoreTitle } from "../lib/contributions";
import { readWatchlist } from "../lib/watchlist";
let db: DatabaseSync, anna: string, max: string, viewer: string, other: string, id: string;
const origin="https://watch.example";
const req=(credential?:string,requestOrigin:string|null=origin)=>new Request(origin,{method:"POST",headers:{...(credential?{cookie:`${sessionCookieName}=${credential}`} :{}),...(requestOrigin?{origin:requestOrigin}:{})}});
const fields={title:"Shared film",contentType:"movie",minutes:"90",seconds:"",numberingStyle:"none",genres:"Drama",moods:["funny"],watchUrl:"https://example.com/watch"};
const provider={namespace:"youtube",externalId:"fixture",sourceUrl:"https://example.com/source"};
beforeEach(()=>{
  db=new DatabaseSync(":memory:");migrate(db);const invite=createGroup(db,"A",origin).inviteUrl.split("/").at(-1)!;
  anna=acceptInvitation(db,invite);max=acceptInvitation(db,invite);viewer=acceptInvitation(db,invite);other=acceptInvitation(db,createGroup(db,"B",origin).inviteUrl.split("/").at(-1)!);
  for(const[credential,name]of[[anna,"Anna"],[max,"Max"],[viewer,"Viewer"],[other,"Other"]])changeProfile(db,req(credential),{intent:"create",name,color:"#1d4ed8"},origin);
  for(const credential of[anna,max]){const result=saveTitle(db,req(credential),{kind:"provider",fields,provider},origin);if(!result.id)throw new Error("Fixture failed");id=result.id;}
  for(const[credential,time,score]of[[anna,4200,9],[max,1200,3]] as const){const context=requireSession(db,credential);db.prepare("INSERT INTO progress(group_id,title_id,member_id,numbering_style,timestamp_seconds,completed) VALUES (?,?,?,'none',?,?)").run(context.groupId,id,context.activeMemberId!,time,credential===anna?1:0);db.prepare("INSERT INTO ratings(group_id,title_id,member_id,score) VALUES (?,?,?,?)").run(context.groupId,id,context.activeMemberId!,score);db.prepare("INSERT INTO notes(group_id,title_id,member_id,body) VALUES (?,?,?,?)").run(context.groupId,id,context.activeMemberId!,credential===anna?"Anna note":"Different Max note");}
});
afterEach(()=>db.close());
const snapshot=()=>JSON.stringify(["titles","title_moods","title_genres","contributors","progress","ratings","notes"].map(t=>db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all()));
const preserved=()=>JSON.stringify([Object.entries(db.prepare("SELECT * FROM titles WHERE id=?").get(id)!).filter(([key])=>key!=="archived"),...["title_moods","title_genres","progress","ratings","notes"].map(t=>db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all())]);
const archive=()=>{removeOwnContribution(db,req(anna),id,{},origin);removeOwnContribution(db,req(max),id,{},origin);};
it("removes only the selected contribution, repeats safely, then archives the final one without deleting history or eligibility identity",()=>{
  const before=preserved();expect(removeOwnContribution(db,req(anna),id,{},origin).kind).toBe("removed");expect(db.prepare("SELECT archived FROM titles WHERE id=?").get(id)?.archived).toBe(0);expect(db.prepare("SELECT member_id FROM contributors WHERE title_id=?").get(id)?.member_id).toBe(requireSession(db,max).activeMemberId);
  const repeated=snapshot();expect(removeOwnContribution(db,req(anna),id,{},origin).kind).toBe("already_removed");expect(snapshot()).toBe(repeated);expect(removeOwnContribution(db,req(max),id,{},origin).kind).toBe("archived");expect(preserved()).toBe(before);expect(db.prepare("SELECT count(*) AS n FROM contributors WHERE title_id=?").get(id)?.n).toBe(0);expect(readWatchlist(db,req(anna)).items).toHaveLength(0);expect(readWatchlist(db,req(anna),true).items.map(i=>i.id)).toEqual([id]);expect(db.prepare("SELECT count(*) AS n FROM titles WHERE archived=0").get()?.n).toBe(0);
});
it("restores the same entry/history, is idempotent and lets a stale second restorer add only their own name",()=>{
  const before=preserved();archive();expect(restoreTitle(db,req(anna),id,{},origin)).toMatchObject({kind:"restored",id});expect(preserved()).toBe(before);const once=snapshot();expect(restoreTitle(db,req(anna),id,{},origin)).toMatchObject({kind:"existing",alreadyAdded:true});expect(snapshot()).toBe(once);expect(restoreTitle(db,req(max),id,{},origin)).toMatchObject({kind:"existing",alreadyAdded:false});expect(db.prepare("SELECT count(*) AS n FROM contributors WHERE title_id=?").get(id)?.n).toBe(2);expect(readWatchlist(db,req(anna)).items).toHaveLength(1);
});
it("manual restoration waits for confirmation and provider restoration preserves saved metadata despite different incoming fields",()=>{
  archive();const before=preserved(),unchanged=snapshot(),incoming={...fields,minutes:"1",genres:"Comedy",moods:["dark"],watchUrl:""};expect(saveTitle(db,req(anna),{kind:"manual",fields:incoming},origin)).toMatchObject({kind:"archived_match",id});expect(snapshot()).toBe(unchanged);expect(saveTitle(db,req(anna),{kind:"manual",fields:incoming,confirmationId:id},origin)).toMatchObject({kind:"restored",id});removeOwnContribution(db,req(anna),id,{},origin);expect(saveTitle(db,req(max),{kind:"provider",fields:{...incoming,title:"Different incoming name"},provider},origin)).toMatchObject({kind:"restored",id});expect(preserved()).toBe(before);
});
it("archived manual/provider attachment requires confirmation and cannot steal an occupied identity",()=>{
  const manual=saveTitle(db,req(anna),{kind:"manual",fields:{...fields,title:"Manual archived"}},origin);if(!manual.id)throw new Error("Fixture failed");removeOwnContribution(db,req(anna),manual.id,{},origin);
  const candidate={kind:"provider" as const,fields:{...fields,title:"Manual archived"},provider:{namespace:"kinopoisk_unofficial",externalId:"42"}};expect(saveTitle(db,req(max),candidate,origin)).toMatchObject({kind:"archived_match",id:manual.id});expect(saveTitle(db,req(max),{...candidate,confirmationId:manual.id},origin)).toMatchObject({kind:"restored",id:manual.id});expect(db.prepare("SELECT provider_namespace,provider_id FROM titles WHERE id=?").get(manual.id)).toMatchObject({provider_namespace:"kinopoisk_unofficial",provider_id:"42"});
  removeOwnContribution(db,req(max),manual.id,{},origin);const before=snapshot();expect(saveTitle(db,req(anna),{kind:"provider",fields:{...fields,title:"Manual archived"},provider,confirmationId:manual.id},origin)).toMatchObject({kind:"identity_conflict",id});expect(snapshot()).toBe(before);
});
it("denies forged/current-member claims, wrong-group targets, bad sessions/origins, and never removes another profile",()=>{
  const before=snapshot();for(const request of[req(),req("forged"),req(other),req(anna,null),req(anna,"https://evil.example")])for(const action of[removeOwnContribution,restoreTitle])expect(()=>action(db,request,id,{},origin)).toThrow("Group access");
  for(const action of[removeOwnContribution,restoreTitle])expect(()=>action(db,req(anna),id,{memberId:requireSession(db,max).activeMemberId},origin)).toThrow("Group access");expect(removeOwnContribution(db,req(viewer),id,{},origin).kind).toBe("already_removed");expect(snapshot()).toBe(before);db.prepare("UPDATE group_sessions SET active_member_id=NULL WHERE token_hash=?").run(credentialHash(anna));expect(()=>restoreTitle(db,req(anna),id,{},origin)).toThrow("Group access");
});
it("rolls back delete, archive update and restoring contributor-insert failures completely, then retries",()=>{
  const before=snapshot();db.exec("CREATE TEMP TRIGGER fixture_failure BEFORE DELETE ON contributors BEGIN SELECT RAISE(ABORT,'PRIVATE_FIXTURE'); END");expect(()=>removeOwnContribution(db,req(anna),id,{},origin)).toThrow("PRIVATE_FIXTURE");expect(snapshot()).toBe(before);db.exec("DROP TRIGGER fixture_failure");removeOwnContribution(db,req(anna),id,{},origin);
  const last=snapshot();db.exec("CREATE TEMP TRIGGER fixture_failure BEFORE UPDATE ON titles BEGIN SELECT RAISE(ABORT,'PRIVATE_FIXTURE'); END");expect(()=>removeOwnContribution(db,req(max),id,{},origin)).toThrow("PRIVATE_FIXTURE");expect(snapshot()).toBe(last);db.exec("DROP TRIGGER fixture_failure");removeOwnContribution(db,req(max),id,{},origin);
  const archived=snapshot();db.exec("CREATE TEMP TRIGGER fixture_failure BEFORE INSERT ON contributors BEGIN SELECT RAISE(ABORT,'PRIVATE_FIXTURE'); END");expect(()=>restoreTitle(db,req(anna),id,{},origin)).toThrow("PRIVATE_FIXTURE");expect(snapshot()).toBe(archived);db.exec("DROP TRIGGER fixture_failure");expect(restoreTitle(db,req(anna),id,{},origin).kind).toBe("restored");
});
it("archive browsing isolates groups and permits a valid session without selected profile",()=>{
  archive();const foreign=saveTitle(db,req(other),{kind:"provider",fields,provider},origin);if(!foreign.id)throw new Error("Fixture failed");removeOwnContribution(db,req(other),foreign.id,{},origin);db.prepare("UPDATE group_sessions SET active_member_id=NULL WHERE token_hash=?").run(credentialHash(anna));const archiveView=readWatchlist(db,req(anna),true);expect(archiveView.activeMemberId).toBeNull();expect(archiveView.items.map(item=>item.id)).toEqual([id]);expect(()=>readWatchlist(db,req("forged"),true)).toThrow("Group access");
});
