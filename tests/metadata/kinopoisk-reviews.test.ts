// @vitest-environment node
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { mkdtempSync,readFileSync,rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename,dirname,join,resolve } from "node:path";
import { beforeEach,afterEach,expect,it } from "vitest";
import { migrate } from "../../db/migrate";
import { createGroup } from "../../lib/groups";
import { acceptInvitation } from "../../lib/sessions";
import { changeProfile } from "../../lib/profiles";
import { beginReview,pageReview,selectReviewCandidate,saveReview,type Providers } from "../../lib/metadata/reviews";
import { kinopoiskUnofficialProvider } from "../../lib/metadata/kinopoisk-transport";
import { expireMetadata } from "../../lib/metadata/lifecycle";
let db:DatabaseSync,token:string,other:string,providers:Providers,time:Date,calls:number;
const origin="https://watch.example",now=()=>new Date(time),poster="https://avatars.mds.yandex.net/get-kinopoisk-image/4303601/ERASE-KINO-POSTER-42/orig";
const json=(value:unknown)=>new Response(JSON.stringify(value));
const film=(id:number)=>({kinopoiskId:id,nameRu:"ERASE_KINO_TITLE_42",type:"FILM",year:1999,filmLength:136,genres:[{genre:"Drama"}],webUrl:`https://www.kinopoisk.ru/film/${id}/`,posterUrl:poster});
const transport:typeof fetch=async input=>{calls++;const url=new URL(String(input));return json(url.pathname.endsWith("/films")?{items:[film(300+Number(url.searchParams.get("page")))],totalPages:8}:film(Number(url.pathname.split("/").at(-1))));};
function req(cookie=token){return new Request(origin,{method:"POST",headers:{origin,cookie:`watchnext_session=${cookie}`}});}
function setup(database:DatabaseSync){db=database;migrate(db);calls=0;time=new Date("2040-10-19T00:00:00Z");token=acceptInvitation(db,createGroup(db,"Kino",origin).inviteUrl.split("/").at(-1)!);other=acceptInvitation(db,createGroup(db,"Other",origin).inviteUrl.split("/").at(-1)!);for(const[cookie,name]of[[token,"Anna"],[other,"Other"]])changeProfile(db,req(cookie),{intent:"create",name,color:"#1d4ed8"},origin);providers={kinopoisk_unofficial:kinopoiskUnofficialProvider({apiKey:randomUUID(),transport}),youtube:{namespace:"youtube",async lookup(){return{kind:"failure",code:"network_error"};}}};}
beforeEach(()=>setup(new DatabaseSync(":memory:")));afterEach(()=>{if(db.isOpen)db.close();});
const search=(text="Film")=>beginReview(db,req(),"kinopoisk_unofficial",text,providers,origin,now);
it("real selected detail supplies app-interpreted runtime/poster and trusted thirty-day provider origins; corrections stay user-owned",async()=>{
  const candidates=await search();expect(candidates).toMatchObject({kind:"candidates",candidates:[{duration:{seconds:null},coverUrl:poster,genres:["Drama"],provenance:{freshness:{policy:"academic_local_snapshot_30_days",refreshBy:"2040-11-18T00:00:00.000Z"}}}]});expect(calls).toBe(1);
  await expect(selectReviewCandidate(db,req(),candidates.handle,"9999",providers,origin,now)).rejects.toThrow();expect(calls).toBe(1);
  const selected=await selectReviewCandidate(db,req(),candidates.handle,"301",providers,origin,now);expect(calls).toBe(2);expect(selected).toMatchObject({kind:"available",item:{duration:{seconds:8160,interpretation:"app_minutes_to_seconds"},provenance:{freshness:{policy:"academic_local_snapshot_30_days"}}}});
  const fields={title:"ERASE_KINO_TITLE_42",contentType:"movie",minutes:"136",seconds:"0",numberingStyle:"none",genres:"Drama",moods:["funny"],watchUrl:""};
  const saved=saveReview(db,req(),selected.handle,fields,"https://www.kinopoisk.ru/film/301/",poster,undefined,origin,now);expect(saved.kind).toBe("created");if(saved.kind!=="created")return;
  expect(db.prepare("SELECT duration_seconds,cover_url,provider_id FROM titles WHERE id=?").get(saved.id)).toMatchObject({duration_seconds:8160,cover_url:poster,provider_id:"301"});expect(db.prepare("SELECT origin,expires_at FROM metadata_fields WHERE title_id=? AND field='duration'").get(saved.id)).toMatchObject({origin:"provider",expires_at:"2040-11-18T00:00:00.000Z"});
  time=new Date(time.getTime()+31*86400000);expireMetadata(db,now());expect(db.prepare("SELECT duration_seconds,cover_url FROM titles WHERE id=?").get(saved.id)).toMatchObject({duration_seconds:null,cover_url:null});expect(db.prepare("SELECT count(*) AS n FROM contributors WHERE title_id=?").get(saved.id)?.n).toBe(1);
});
it("generic opaque paging is provider/context/query bound, shared capped and fixed-expiry, including concurrent handles",async()=>{
  const one=await search();expect(one.page?.number).toBe(1);await expect(pageReview(db,req(other),one.handle,"next",providers,origin,now)).rejects.toThrow();await expect(pageReview(db,req(),"2","next",providers,origin,now)).rejects.toThrow();
  const two=await pageReview(db,req(),one.handle,"next",providers,origin,now);expect(two).toMatchObject({kind:"candidates",candidates:[{identity:{externalId:"302"}}],page:{number:2}});
  const previous=await pageReview(db,req(),two.handle,"previous",providers,origin,now);expect(previous.page?.number).toBe(1);
  const jobs=[pageReview(db,req(),one.handle,"next",providers,origin,now),pageReview(db,req(),one.handle,"next",providers,origin,now)];await expect(pageReview(db,req(),one.handle,"next",providers,origin,now)).rejects.toThrow();expect((await Promise.all(jobs)).every(value=>value.page?.limitReached)).toBe(true);expect(calls).toBe(5);
  const newer=await search("Changed query");await expect(pageReview(db,req(),one.handle,"next",providers,origin,now)).rejects.toThrow();time=new Date(time.getTime()+600000);await expect(pageReview(db,req(),newer.handle,"next",providers,origin,now)).rejects.toThrow();expect(db.prepare("SELECT * FROM metadata_reviews").all()).toEqual([]);
});
it("empty pages honor current provider navigation; wrong-provider snapshot cannot consume another chain",async()=>{
  providers.kinopoisk_unofficial=kinopoiskUnofficialProvider({apiKey:randomUUID(),transport:async()=>json({totalPages:3,items:[]})});const empty=await search();expect(empty).toMatchObject({kind:"no_match",page:{number:1,next:empty.handle}});
  const row=db.prepare("SELECT handle_hash,payload FROM metadata_reviews WHERE json_extract(payload,'$.kind')='candidates'").get()!;const payload=JSON.parse(row.payload as string);payload.page.provider="youtube";db.prepare("UPDATE metadata_reviews SET payload=? WHERE handle_hash=?").run(JSON.stringify(payload),row.handle_hash);
  await expect(pageReview(db,req(),empty.handle,"next",providers,origin,now)).rejects.toThrow();
});
it("new query invalidates held old Kinopoisk result before any snapshot can be returned/stored",async()=>{
  let started!:()=>void,release!:()=>void;const ready=new Promise<void>(resolve=>{started=resolve;}),gate=new Promise<void>(resolve=>{release=resolve;});const delayed:Providers={...providers,kinopoisk_unofficial:kinopoiskUnofficialProvider({apiKey:randomUUID(),transport:async(input,init)=>{started();await gate;return transport(input,init);}})};
  const held=beginReview(db,req(),"kinopoisk_unofficial","Old",delayed,origin,now).then(()=>"returned",()=>"denied");await ready;expect((await search("New")).kind).toBe("candidates");release();expect(await held).toBe("denied");expect(db.prepare("SELECT count(*) AS n FROM metadata_reviews").get()?.n).toBe(2);
});
it("new poster/candidate fields are physically deleted at the original ten-minute review deadline",async()=>{
  db.close();const root=mkdtempSync(join(tmpdir(),"watchnext-kino-expiry-")),path=join(root,"fixture.sqlite");try{setup(new DatabaseSync(path));await search();expect(readFileSync(path).includes(Buffer.from("ERASE-KINO-POSTER-42"))).toBe(true);time=new Date(time.getTime()+600001);expireMetadata(db,now());expect(db.prepare("SELECT * FROM metadata_reviews").all()).toEqual([]);db.close();for(const marker of["ERASE_KINO_TITLE_42","ERASE-KINO-POSTER-42"])expect(readFileSync(path).includes(Buffer.from(marker))).toBe(false);}finally{if(db.isOpen)db.close();if(dirname(resolve(root))!==resolve(tmpdir())||!basename(root).startsWith("watchnext-kino-expiry-"))throw new Error("Unsafe fixture cleanup");rmSync(root,{recursive:true,force:true});}
});
