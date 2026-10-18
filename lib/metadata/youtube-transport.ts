import { clearTimeout,setTimeout } from "node:timers";
import { providerIdentity } from "./lookup";
import { youtubeDurationSeconds,youtubeLookupQuery } from "./youtube-input";
import { youtubeThumbnail } from "./youtube-thumbnail";
import { LookupAdmissionError,youtubePool,type LookupPool } from "./admission";
import type { FailureCode,ItemProjection,MetadataProvider,ProviderReply } from "./types";
type Options={apiKey?:string;transport?:typeof fetch;timeoutMs?:number;pool?:LookupPool};
type RecordValue=Record<string,unknown>;
const record=(value:unknown):RecordValue=>value!==null&&typeof value==="object"&&!Array.isArray(value)?value as RecordValue:{};
const failure=(code:FailureCode,retryAfterSeconds?:unknown):ProviderReply=>({kind:"failure",code,retryAfterSeconds});
class InvalidResponse extends Error{}
const pageToken=(value:unknown)=>typeof value==="string"&&value.length>0&&value.length<=1024&&!/[\p{Cc}\s]/u.test(value)?value:undefined;
function retryAfter(response:Response){const value=response.headers.get("retry-after");if(!value||!/^\d+$/.test(value))return null;const seconds=Number(value);return Number.isSafeInteger(seconds)&&seconds<=86400?seconds:null;}
function responseError(response:Response,envelope:RecordValue):ProviderReply|null{
  if(response.ok)return null;
  const errors=record(envelope.error).errors,reasons=Array.isArray(errors)?errors.map(error=>record(error).reason):[];
  if(response.status===429||(response.status===403&&reasons.some(reason=>reason==="rateLimitExceeded"||reason==="userRateLimitExceeded")))return failure("rate_limited",retryAfter(response));
  if(response.status===403&&reasons.some(reason=>reason==="quotaExceeded"||reason==="dailyLimitExceeded"))return failure("quota_exhausted");
  if(response.status===404)return failure("not_found_or_inaccessible");
  return failure([400,401,403].includes(response.status)?"not_configured":"provider_error");
}
async function boundedBody(response:Response,signal:AbortSignal){
  const maximum=262144,length=response.headers.get("content-length");if(length&&/^\d+$/.test(length)&&Number(length)>maximum){void response.body?.cancel();throw new InvalidResponse();}
  if(!response.body){if(!response.ok)return {};throw new InvalidResponse();}const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
  const abort=()=>{void reader.cancel().catch(()=>{});};signal.addEventListener("abort",abort,{once:true});
  try{while(true){signal.throwIfAborted();const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>maximum){await reader.cancel();throw new InvalidResponse();}chunks.push(part.value);}signal.throwIfAborted();
    try{return record(JSON.parse(Buffer.concat(chunks).toString("utf8")));}catch{if(response.ok)throw new InvalidResponse();return {};}
  }finally{signal.removeEventListener("abort",abort);reader.releaseLock();}
}
function projection(value:unknown,id:string):ItemProjection|null{
  const video=record(value),status=record(video.status);if(video.id!==id)return null;
  if(status.privacyStatus==="private"||["deleted","failed","rejected"].includes(String(status.uploadStatus)))return null;
  const snippet=record(video.snippet),details=record(video.contentDetails),live=record(video.liveStreamingDetails);
  const completedLive=typeof live.actualEndTime==="string"&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(live.actualEndTime)&&Number.isFinite(Date.parse(live.actualEndTime));
  const verified=snippet.liveBroadcastContent==="none"&&(video.liveStreamingDetails===undefined||completedLive),seconds=youtubeDurationSeconds(details.duration);
  const thumbnails=record(snippet.thumbnails),cover=["maxres","standard","high","medium","default"].map(size=>youtubeThumbnail(record(thumbnails[size]).url)).find(value=>value!==null)??null;
  const canonical=`https://www.youtube.com/watch?v=${id}`;
  return {externalId:id,title:snippet.title,...(snippet.channelTitle!==undefined?{channelTitle:snippet.channelTitle}:{}),contentType:"youtube",duration:{seconds,meaning:"full_item",verified:verified&&seconds!==null},coverUrl:cover,sourceUrl:canonical,watchUrl:canonical,genres:[],uncertainFields:verified?[]:["duration"]};
}
/** Server-only configured entry owns credentials; injectable native transport is for offline checks. */
export function youtubeProvider(options:Options):MetadataProvider{
  const timeoutMs=options.timeoutMs??10000;
  return {namespace:"youtube",async lookup(query,{signal}){
    if(query.kind==="detail"?!providerIdentity("youtube",query.externalId):!youtubeLookupQuery({kind:"title",text:query.text})||(query.pageToken!==undefined&&!pageToken(query.pageToken)))return failure("invalid_query");
    if(signal?.aborted)return failure("cancelled");
    const key=options.apiKey?.trim();if(!key||/[\p{Cc}\s]/u.test(key)||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000)return failure("not_configured");
    let release:()=>void;try{release=await(options.pool??youtubePool).acquire(signal);}catch(error){return failure(error instanceof LookupAdmissionError?error.code:"provider_error",30);}
    const controller=new AbortController();let timedOut=false,rejectAbort:()=>void=()=>{};
    const aborted=new Promise<never>((_resolve,reject)=>{rejectAbort=()=>reject(new Error("Lookup interrupted"));});
    const onAbort=()=>{controller.abort();rejectAbort();};signal?.addEventListener("abort",onAbort,{once:true});
    const timer=setTimeout(()=>{timedOut=true;onAbort();},timeoutMs);
    const fetchEnvelope=async(path:"search"|"videos",parameters:Record<string,string>)=>{
      controller.signal.throwIfAborted();const url=new URL(`https://www.googleapis.com/youtube/v3/${path}`);for(const[name,value]of Object.entries(parameters))url.searchParams.set(name,value);
      const response=await(options.transport??fetch)(url,{method:"GET",headers:{"X-Goog-Api-Key":key,Accept:"application/json"},signal:controller.signal,redirect:"error",cache:"no-store",credentials:"omit",referrerPolicy:"no-referrer"});
      const body=await boundedBody(response,controller.signal);return{body,error:responseError(response,body)};
    };
    try{
      if(signal?.aborted)onAbort();
      const work=(async():Promise<ProviderReply>=>{
        let ids:string[],navigation:{next?:string;previous?:string}|undefined;
        if(query.kind==="search"){
          const search=await fetchEnvelope("search",{part:"snippet",type:"video",order:"relevance",maxResults:"10",q:query.text.trim(),...(query.pageToken?{pageToken:query.pageToken}:{})});if(search.error)return search.error;
          if(!Array.isArray(search.body.items)||search.body.items.length>10)throw new InvalidResponse();
          ids=[];for(const item of search.body.items){const identity=record(record(item).id);if(identity.kind!=="youtube#video")continue;const id=providerIdentity("youtube",identity.videoId)?.externalId;if(id&&!ids.includes(id))ids.push(id);}
          navigation={...(pageToken(search.body.nextPageToken)?{next:pageToken(search.body.nextPageToken)}:{}),...(pageToken(search.body.prevPageToken)?{previous:pageToken(search.body.prevPageToken)}:{})};
          if(!ids.length)return{kind:"search",candidates:[],navigation};
        }else ids=[query.externalId];
        const details=await fetchEnvelope("videos",{part:"snippet,contentDetails,status,liveStreamingDetails",id:ids.join(",")});if(details.error)return details.error;
        if(!Array.isArray(details.body.items)||details.body.items.length>ids.length)throw new InvalidResponse();
        const byId=new Map<string,unknown>();for(const value of details.body.items){const id=record(value).id;if(typeof id!=="string"||!ids.includes(id)||byId.has(id))throw new InvalidResponse();byId.set(id,value);}
        const candidates=ids.flatMap(id=>{const item=byId.has(id)?projection(byId.get(id),id):null;return item?[item]:[];});
        if(query.kind==="search")return{kind:"search",candidates,navigation};
        return candidates.length?{kind:"item",item:candidates[0]}:failure("not_found_or_inaccessible");
      })();
      const result=await Promise.race([work,aborted]);return JSON.stringify(result).includes(key)?failure("invalid_metadata"):result;
    }catch(error){return failure(signal?.aborted?"cancelled":timedOut?"timeout":error instanceof InvalidResponse?"invalid_metadata":"network_error");}
    finally{clearTimeout(timer);signal?.removeEventListener("abort",onAbort);release();}
  }};
}
