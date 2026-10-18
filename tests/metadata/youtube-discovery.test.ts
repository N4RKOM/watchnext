// @vitest-environment node
import { randomUUID } from "node:crypto";
import { afterEach,expect,it,vi } from "vitest";
import { youtubeProvider } from "../../lib/metadata/youtube-transport";
import { youtubeLookupQuery } from "../../lib/metadata/youtube-input";
import { youtubeThumbnail } from "../../lib/metadata/youtube-thumbnail";
import { lookupMetadata } from "../../lib/metadata/lookup";
import { LookupPool,LookupBudget } from "../../lib/metadata/admission";
const id="YtFixture01",second="YtFixture02",hidden="YtFixture03",missing="YtFixture04";
const now=()=>new Date("2026-10-19T00:00:00Z");
const json=(body:unknown,status=200,headers?:HeadersInit)=>new Response(JSON.stringify(body),{status,headers});
const video=(id:string,extra:Record<string,unknown>={})=>({id,snippet:{title:`Video ${id}`,channelTitle:"Synthetic channel",liveBroadcastContent:"none",thumbnails:{high:{url:`https://i.ytimg.com/vi/${id}/hqdefault.jpg`}}},contentDetails:{duration:"PT24M"},status:{privacyStatus:"public",uploadStatus:"processed"},...extra});
afterEach(()=>vi.useRealTimers());
it("uses explicit bounded Unicode title intent, keeps old strict links and never searches malformed URL-like input",()=>{
  expect(youtubeLookupQuery({kind:"title",text:"  Funny: коты 😀  "})).toEqual({kind:"search",text:"Funny: коты 😀"});expect(youtubeLookupQuery({kind:"title",text:"😀".repeat(200)})).toMatchObject({kind:"search"});
  for(const input of[{kind:"title",text:"x".repeat(201)},{kind:"title",text:"one\ntwo"},{kind:"title",text:"https://youtube.com/playlist?list=x"},{kind:"title",text:"https://foreign.example/video"},{kind:"title",text:"//foreign.example"},{kind:"title",text:"data:bad"},{kind:"title",text:"ok",pageToken:"forged"},"some title"]){expect(youtubeLookupQuery(input)).toBeNull();}
  expect(youtubeLookupQuery(`https://youtu.be/${id}`)).toEqual({kind:"detail",externalId:id});expect(youtubeLookupQuery({kind:"title",text:id})).toEqual({kind:"detail",externalId:id});
});
it("searches once and batch-enriches deduplicated exact IDs in search order, retaining manual unknown live runtime",async()=>{
  const key=randomUUID(),calls:string[]=[];
  const transport:typeof fetch=async(input,init)=>{const url=new URL(String(input));calls.push(url.pathname);expect(url.origin).toBe("https://www.googleapis.com");expect(url.searchParams.has("key")).toBe(false);expect(new Headers(init?.headers).get("X-Goog-Api-Key")===key).toBe(true);expect(init).toMatchObject({redirect:"error",cache:"no-store",credentials:"omit",referrerPolicy:"no-referrer"});
    if(url.pathname.endsWith("/search")){expect(Object.fromEntries(url.searchParams)).toEqual({part:"snippet",type:"video",order:"relevance",maxResults:"10",q:"Funny коты"});return json({items:[id,second,id,hidden,missing].map(videoId=>({id:{kind:"youtube#video",videoId}})),nextPageToken:"PRIVATE_PROVIDER_NEXT"});}
    expect(url.searchParams.get("id")).toBe([id,second,hidden,missing].join(","));expect(url.searchParams.get("part")).toBe("snippet,contentDetails,status,liveStreamingDetails");return json({items:[video(second,{snippet:{title:"Live video",channelTitle:"Live channel",liveBroadcastContent:"live"}}),video(hidden,{status:{privacyStatus:"private"}}),video(id)]});
  };
  const result=await lookupMetadata(youtubeProvider({apiKey:key,transport}),{kind:"search",text:"Funny коты"},{now});expect(calls).toEqual(["/youtube/v3/search","/youtube/v3/videos"]);expect(result.kind).toBe("candidates");if(result.kind!=="candidates")return;
  expect(result.candidates.map(value=>value.identity.externalId)).toEqual([id,second]);expect(result.candidates[0]).toMatchObject({channelTitle:"Synthetic channel",duration:{seconds:1440,meaning:"full_item"},coverUrl:`https://i.ytimg.com/vi/${id}/hqdefault.jpg`,provenance:{retrievedAt:now().toISOString(),freshness:{refreshBy:"2026-11-18T00:00:00.000Z"}}});expect(result.candidates[1]).toMatchObject({duration:{seconds:null},manualFields:["duration"],coverUrl:null});expect(JSON.stringify(result).includes("PRIVATE_PROVIDER_NEXT")||JSON.stringify(result).includes(key)).toBe(false);
});
it.each(["http://i.ytimg.com/a","https://evil.i.ytimg.com/a","https://i.ytimg.com.evil/a","https://u:p@i.ytimg.com/a","https://i.ytimg.com:444/a","https://127.0.0.1/a","https://i.ytimg.com/a#fragment","https://i.ytimg.com/a?token=private","https://i.ytimg.com/\\a"])("rejects untrusted thumbnail %s",value=>expect(youtubeThumbnail(value)).toBeNull());
it("accepts only supplied allowlisted HTTPS images and normalizes default ports",()=>{expect(youtubeThumbnail("https://i.ytimg.com:443/vi/example/image.jpg")).toBe("https://i.ytimg.com/vi/example/image.jpg");});
it.each(["foreign","duplicate","oversize-search","oversize-details","malformed-search"])("rejects adversarial %s envelopes without substituting video identities",async scenario=>{
  const transport:typeof fetch=async input=>{const url=new URL(String(input));if(url.pathname.endsWith("/search"))return json(scenario==="malformed-search"?{}:{items:Array.from({length:scenario==="oversize-search"?11:1},()=>({id:{kind:"youtube#video",videoId:id}}))});return json({items:scenario==="foreign"?[video(second)]:scenario==="duplicate"?[video(id),video(id)]:[video(id),video(second)]});};
  expect(await lookupMetadata(youtubeProvider({apiKey:randomUUID(),transport}),{kind:"search",text:"Title"},{now})).toMatchObject({kind:"failure",code:"invalid_metadata",manualFallback:true});
});
it.each([false,true])("bounds response bytes with announced=%s",async announced=>{const transport:typeof fetch=async()=>new Response("x".repeat(262145),{headers:announced?{"content-length":"262145"}:{}});expect(await lookupMetadata(youtubeProvider({apiKey:randomUUID(),transport}),{kind:"search",text:"Title"})).toMatchObject({code:"invalid_metadata"});});
it("shares one search-plus-batch deadline and never starts enrichment after cancellation",async()=>{
  vi.useFakeTimers();let calls=0;const transport:typeof fetch=async input=>{calls++;await new Promise(resolve=>setTimeout(resolve,6));return json(new URL(String(input)).pathname.endsWith("/search")?{items:[{id:{kind:"youtube#video",videoId:id}}]}:{items:[video(id)]});};
  const pending=lookupMetadata(youtubeProvider({apiKey:randomUUID(),transport,timeoutMs:10}),{kind:"search",text:"Title"});await vi.advanceTimersByTimeAsync(11);expect(await pending).toMatchObject({code:"timeout"});expect(calls).toBe(2);await vi.advanceTimersByTimeAsync(10);
  const controller=new AbortController();let release!:(value:Response)=>void,started!:()=>void;const ready=new Promise<void>(resolve=>{started=resolve;});calls=0;
  const held:typeof fetch=async()=>{calls++;started();return new Promise(resolve=>{release=resolve;});};const cancelled=lookupMetadata(youtubeProvider({apiKey:randomUUID(),transport:held}),{kind:"search",text:"Title"},{signal:controller.signal});await ready;controller.abort();expect(await cancelled).toMatchObject({code:"cancelled"});release(json({items:[{id:{kind:"youtube#video",videoId:id}}]}));await Promise.resolve();expect(calls).toBe(1);
});
it("native pool admits only two active/eight waiting, releases failures/cancellation and expires bounded queued work",async()=>{
  const pool=new LookupPool(),release1=await pool.acquire(),release2=await pool.acquire();const controllers=Array.from({length:8},()=>new AbortController()),queued=controllers.map(controller=>pool.acquire(controller.signal).then(release=>{release();return"entered";},()=>"cancelled"));await expect(pool.acquire()).rejects.toMatchObject({code:"rate_limited"});for(const controller of controllers)controller.abort();expect(await Promise.all(queued)).toEqual(Array(8).fill("cancelled"));release1();release2();(await pool.acquire())();
  vi.useFakeTimers();const short=new LookupPool(1,1,5),release=await short.acquire(),waiting=short.acquire().then(()=>"entered",()=>"expired");await vi.advanceTimersByTimeAsync(6);expect(await waiting).toBe("expired");release();(await short.acquire())();
});
it("context budgets cap attempts and key cardinality then expire without evicting live limits",()=>{const budget=new LookupBudget(2,2,10);budget.take("a",0);budget.take("a",1);expect(()=>budget.take("a",2)).toThrow();budget.take("b",2);expect(()=>budget.take("c",3)).toThrow();expect(()=>budget.take("c",11)).not.toThrow();});
