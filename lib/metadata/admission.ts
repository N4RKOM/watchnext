import type { FailureCode } from "./types";
export class LookupAdmissionError extends Error {
  code:FailureCode;
  constructor(code:FailureCode){super("Lookup admission unavailable");this.code=code;}
}
/** Native process-local bounds; no provider payload or credential is retained. */
export class LookupPool {
  private active=0;
  private queue:{start:()=>void}[]=[];
  private limit:number;private waiting:number;private queueMs:number;
  constructor(limit=2,waiting=8,queueMs=30000){this.limit=limit;this.waiting=waiting;this.queueMs=queueMs;}
  acquire(signal?:AbortSignal):Promise<()=>void>{
    if(signal?.aborted)return Promise.reject(new LookupAdmissionError("cancelled"));
    if(this.active>=this.limit&&this.queue.length>=this.waiting)return Promise.reject(new LookupAdmissionError("rate_limited"));
    return new Promise((resolve,reject)=>{
      let timer:ReturnType<typeof setTimeout>|undefined,settled=false;
      const clean=()=>{if(timer)clearTimeout(timer);signal?.removeEventListener("abort",abort);};
      const item={start:()=>{if(settled)return;settled=true;clean();this.active++;let released=false;resolve(()=>{if(released)return;released=true;this.active--;this.queue.shift()?.start();});}};
      const abort=()=>{if(settled)return;settled=true;clean();this.queue=this.queue.filter(entry=>entry!==item);reject(new LookupAdmissionError(signal?.aborted?"cancelled":"rate_limited"));};
      if(this.active<this.limit)item.start();else{this.queue.push(item);signal?.addEventListener("abort",abort,{once:true});timer=setTimeout(abort,this.queueMs);if(signal?.aborted)abort();}
    });
  }
}
export class LookupBudget {
  private entries=new Map<string,{count:number;expires:number}>();
  private limit:number;private capacity:number;private windowMs:number;
  constructor(limit=20,capacity=2048,windowMs=900000){this.limit=limit;this.capacity=capacity;this.windowMs=windowMs;}
  take(key:string,now=Date.now()){
    for(const[name,value]of this.entries)if(value.expires<=now)this.entries.delete(name);
    const value=this.entries.get(key);
    if((!value&&this.entries.size>=this.capacity)||(value&&value.count>=this.limit))throw new LookupAdmissionError("rate_limited");
    this.entries.set(key,{count:(value?.count??0)+1,expires:value?.expires??now+this.windowMs});
  }
}
export const youtubePool=new LookupPool();
export const youtubeBudget=new LookupBudget();
