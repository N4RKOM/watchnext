// @vitest-environment node
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { mkdtempSync,readFileSync,rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename,dirname,join,resolve } from "node:path";
import { afterEach,beforeEach,expect,it } from "vitest";
import { migrate } from "../../db/migrate";
import { createGroup } from "../../lib/groups";
import { acceptInvitation,credentialHash } from "../../lib/sessions";
import { changeProfile } from "../../lib/profiles";
import { requestContext } from "../../lib/accounts/context";
import { beginReview,pageReview,selectReviewCandidate,saveReview,type Providers } from "../../lib/metadata/reviews";
import { youtubeProvider } from "../../lib/metadata/youtube-transport";
import { expireMetadata } from "../../lib/metadata/lifecycle";
let db:DatabaseSync,first:string,second:string,foreign:string,providers:Providers,time:Date,calls:number;
const origin="https://watch.example",now=()=>new Date(time),videoId=(number:number)=>`YtPage${String(number).padStart(5,"0")}`;
const json=(value:unknown)=>new Response(JSON.stringify(value));
const video=(id:string)=>({id,snippet:{title:"ERASE_DISCOVERY_TITLE_42",channelTitle:"ERASE_DISCOVERY_CHANNEL_42",liveBroadcastContent:"none",thumbnails:{high:{url:"https://i.ytimg.com/ERASE_DISCOVERY_THUMB_42.jpg"}}},contentDetails:{duration:"PT2M"},status:{privacyStatus:"public",uploadStatus:"processed"}});
const transport:typeof fetch=async input=>{calls++;const url=new URL(String(input));if(url.pathname.endsWith("/search")){const page=Number(url.searchParams.get("pageToken")?.split("_").at(-1)??1);return json({items:[{id:{kind:"youtube#video",videoId:videoId(page)}}],nextPageToken:`PROVIDER_PRIVATE_PAGE_${page+1}`,...(page>1?{prevPageToken:`PROVIDER_PRIVATE_PAGE_${page-1}`}:{})});}return json({items:url.searchParams.get("id")!.split(",").map(video)});};
function raw(token=first){return new Request(origin,{method:"POST",headers:{origin,cookie:`watchnext_session=${token}; watchnext_access_mode=legacy`}});}
function req(token=first){const request=raw(token);request.headers.set("x-watchnext-context",requestContext(db,request).contextKey);return request;}
function setup(database:DatabaseSync){db=database;migrate(db);calls=0;time=new Date("2026-10-19T00:00:00Z");const invite=createGroup(db,"Discovery",origin).inviteUrl.split("/").at(-1)!;first=acceptInvitation(db,invite);second=acceptInvitation(db,invite);foreign=acceptInvitation(db,createGroup(db,"Other",origin).inviteUrl.split("/").at(-1)!);for(const[token,name]of[[first,"Anna"],[second,"Max"],[foreign,"Other"]])changeProfile(db,raw(token),{intent:"create",name,color:"#1d4ed8"},origin);providers={youtube:youtubeProvider({apiKey:randomUUID(),transport}),kinopoisk_unofficial:{namespace:"kinopoisk_unofficial",async lookup(){return{kind:"search",candidates:[{externalId:"1001",title:"Kino compatible",contentType:"movie"}]};}}};}
beforeEach(()=>setup(new DatabaseSync(":memory:")));afterEach(()=>{if(db.isOpen)db.close();});
const search=(text="Funny title",request=req())=>beginReview(db,request,"youtube",{kind:"title",text},providers,origin,now);
it("real title search requires explicit contained YouTube selection and fresh detail before trusted save",async()=>{
  const result=await search();expect(result.kind).toBe("candidates");expect(calls).toBe(2);expect(JSON.stringify(result).includes("PROVIDER_PRIVATE_PAGE")).toBe(false);expect(result.page).toMatchObject({number:1,limitReached:false,next:result.handle});
  await expect(selectReviewCandidate(db,req(),result.handle,videoId(9),providers,origin,now)).rejects.toThrow();expect(calls).toBe(2);
  const fields={title:"ERASE_DISCOVERY_TITLE_42",contentType:"youtube",minutes:"2",seconds:"0",numberingStyle:"none",genres:"",moods:["funny"],watchUrl:`https://www.youtube.com/watch?v=${videoId(1)}`};
  expect(()=>saveReview(db,req(),result.handle,fields,"","",undefined,origin,now)).toThrow();time=new Date(time.getTime()+1000);
  const detail=await selectReviewCandidate(db,req(),result.handle,videoId(1),providers,origin,now);expect(calls).toBe(3);expect(detail).toMatchObject({kind:"available",item:{channelTitle:"ERASE_DISCOVERY_CHANNEL_42",provenance:{retrievedAt:now().toISOString()}}});
  const saved=saveReview(db,req(),detail.handle,fields,fields.watchUrl,"https://i.ytimg.com/ERASE_DISCOVERY_THUMB_42.jpg",undefined,origin,now);expect(saved.kind).toBe("created");if(saved.kind!=="created")return;
  expect(db.prepare("SELECT provider_id FROM titles WHERE id=?").get(saved.id)?.provider_id).toBe(videoId(1));expect(db.prepare("SELECT origin,expires_at FROM metadata_fields WHERE title_id=? AND field='coverUrl'").get(saved.id)).toMatchObject({origin:"provider",expires_at:"2026-11-18T00:00:01.000Z"});expect(db.prepare("PRAGMA table_info(titles)").all().some(row=>row.name==="channelTitle")).toBe(false);
  const kino=await beginReview(db,req(),"kinopoisk_unofficial","Kino",providers,origin,now);expect(kino).toMatchObject({kind:"candidates",candidates:[{identity:{namespace:"kinopoisk_unofficial",externalId:"1001"}}]});
});
it("opaque next/previous handles stay context/query bound with a fixed shared five-request chain limit",async()=>{
  const one=await search(),deadline=db.prepare("SELECT min(expires_at) AS value FROM metadata_reviews").get()?.value;
  for(const token of[second,foreign])await expect(pageReview(db,req(token),one.page?.next,"next",providers,origin,now)).rejects.toThrow();
  await expect(pageReview(db,req(),"PROVIDER_PRIVATE_PAGE_2","next",providers,origin,now)).rejects.toThrow();
  const two=await pageReview(db,req(),one.page?.next,"next",providers,origin,now);expect(two.page?.number).toBe(2);
  const previous=await pageReview(db,req(),two.page?.previous,"previous",providers,origin,now);expect(previous.page?.number).toBe(1);
  const four=await pageReview(db,req(),previous.page?.next,"next",providers,origin,now);const five=await pageReview(db,req(),four.page?.next,"next",providers,origin,now);expect(five.page).toEqual({number:3,limitReached:true});expect(calls).toBe(10);
  await expect(pageReview(db,req(),one.page?.next,"next",providers,origin,now)).rejects.toThrow();expect(calls).toBe(10);expect(db.prepare("SELECT DISTINCT expires_at FROM metadata_reviews").all()).toEqual([{expires_at:deadline}]);expect(db.prepare("SELECT count(*) AS n FROM metadata_reviews").get()?.n).toBeLessThanOrEqual(20);
});
it("new queries and switching to a strict link invalidate old chains, including pending old results",async()=>{
  const old=await search();await search("Different query");await expect(pageReview(db,req(),old.handle,"next",providers,origin,now)).rejects.toThrow();
  const current=await search();await beginReview(db,req(),"youtube",videoId(1),providers,origin,now);await expect(pageReview(db,req(),current.handle,"next",providers,origin,now)).rejects.toThrow();
  let release!:()=>void,started!:()=>void;const ready=new Promise<void>(resolve=>{started=resolve;}),gate=new Promise<void>(resolve=>{release=resolve;});
  const delayed:Providers={...providers,youtube:youtubeProvider({apiKey:randomUUID(),transport:async(input,init)=>{started();await gate;return transport(input,init);}})};
  const pending=beginReview(db,req(),"youtube",{kind:"title",text:"Pending old query"},delayed,origin,now).then(()=>"returned",()=>"denied");await ready;const fresh=await search("Latest query");release();expect(await pending).toBe("denied");expect(fresh.kind).toBe("candidates");
  expect(db.prepare("SELECT payload FROM metadata_reviews WHERE json_extract(payload,'$.kind')='youtube_chain'").all()).toHaveLength(1);
});
it("concurrent replayed page handles share one atomic five-request allowance",async()=>{
  const firstPage=await search();const jobs=Array.from({length:4},()=>pageReview(db,req(),firstPage.handle,"next",providers,origin,now));
  await expect(pageReview(db,req(),firstPage.handle,"next",providers,origin,now)).rejects.toThrow();
  const results=await Promise.all(jobs);expect(results.every(result=>result.page?.limitReached===true&&result.page.next===undefined)).toBe(true);expect(calls).toBe(10);
});
it("handles empty/filtered pages and missing navigation honestly while expired handles fail before transport",async()=>{
  providers.youtube=youtubeProvider({apiKey:randomUUID(),transport:async()=>json({items:[],nextPageToken:"PRIVATE_NEXT_EMPTY"})});const empty=await search();expect(empty).toMatchObject({kind:"no_match",candidates:[],page:{number:1,next:empty.handle}});
  providers.youtube=youtubeProvider({apiKey:randomUUID(),transport:async()=>json({items:[]})});const end=await pageReview(db,req(),empty.handle,"next",providers,origin,now);expect(end).toMatchObject({kind:"no_match",page:{number:2}});expect(end.page?.next).toBeUndefined();
  time=new Date(time.getTime()+600000);await expect(pageReview(db,req(),empty.handle,"next",providers,origin,now)).rejects.toThrow();expect(db.prepare("SELECT * FROM metadata_reviews").all()).toEqual([]);
});
it("application context budget admits twenty logical lookups and never exceeds twenty stored reviews",async()=>{
  for(let count=0;count<20;count++)expect((await beginReview(db,req(),"youtube",videoId(1),providers,origin,now)).handle).toBeTruthy();expect(db.prepare("SELECT count(*) AS n FROM metadata_reviews").get()?.n).toBe(20);const before=calls;expect(await beginReview(db,req(),"youtube",videoId(1),providers,origin,now)).toMatchObject({code:"rate_limited",manualFallback:true});expect(calls).toBe(before);
  time=new Date(time.getTime()+900000);expect((await beginReview(db,req(),"youtube",videoId(1),providers,origin,now)).handle).toBeTruthy();
});
it("secure expiry physically deletes candidate title/channel/thumbnail and private page payload bytes",async()=>{
  db.close();const root=mkdtempSync(join(tmpdir(),"watchnext-discovery-expiry-")),path=join(root,"fixture.sqlite");
  try{setup(new DatabaseSync(path));const result=await search();expect(result.kind).toBe("candidates");for(const marker of["ERASE_DISCOVERY_TITLE_42","ERASE_DISCOVERY_CHANNEL_42","ERASE_DISCOVERY_THUMB_42","PROVIDER_PRIVATE_PAGE_2"])expect(readFileSync(path).includes(Buffer.from(marker))).toBe(true);
    time=new Date(time.getTime()+600001);expireMetadata(db,now());expect(db.prepare("SELECT * FROM metadata_reviews").all()).toEqual([]);db.close();for(const marker of["ERASE_DISCOVERY_TITLE_42","ERASE_DISCOVERY_CHANNEL_42","ERASE_DISCOVERY_THUMB_42","PROVIDER_PRIVATE_PAGE_2"])expect(readFileSync(path).includes(Buffer.from(marker))).toBe(false);
  }finally{if(db.isOpen)db.close();if(dirname(resolve(root))!==resolve(tmpdir())||!basename(root).startsWith("watchnext-discovery-expiry-"))throw new Error("Unsafe fixture cleanup");rmSync(root,{recursive:true,force:true});}
});
