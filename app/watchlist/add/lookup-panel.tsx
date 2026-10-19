"use client";
import { useEffect, useRef, useState } from "react";
import type { ReviewResult } from "../../../lib/metadata/reviews";
import type { MetadataItem } from "../../../lib/metadata/types";
import { contentTypes, durationLabel } from "../../../lib/title-state";
import { Cover } from "../cover";
export type LookupAction = (form: FormData) => Promise<ReviewResult>;
export function LookupPanel({lookup,select,page,apply,revision,invalidate,reset=0}: {lookup:LookupAction;select:LookupAction;page?:LookupAction;apply:(handle:string,item:MetadataItem,revision:number)=>void;revision:()=>number;invalidate:()=>void;reset?:number}) {
  const [source,setSource]=useState("manual"),[kind,setKind]=useState("link"),[query,setQuery]=useState(""),[result,setResult]=useState<ReviewResult|null>(null),[loading,setLoading]=useState("");
  const generation=useRef(0),feedback=useRef<HTMLParagraphElement>(null);
  const cancel=()=>{generation.current++;setLoading("");setResult(null);invalidate();};
  useEffect(()=>{generation.current++;setLoading("");setResult(null);return()=>{generation.current++;};},[reset]);
  async function run(action:LookupAction,form:FormData,label:string) {
    invalidate();const current=++generation.current,started=revision();let itemResult=false;setLoading(label);
    try{const next=await action(form);if(generation.current!==current)return;setResult(next);if((next.kind==="available"||next.kind==="incomplete")&&next.handle){itemResult=true;apply(next.handle,next.item,started);}}
    catch{if(generation.current===current)setResult({kind:"failure",code:"provider_error",message:"Lookup could not finish. Your details are kept; retry or enter them manually.",retry:"user",retryAfterSeconds:null,manualFallback:true});}
    finally{if(generation.current===current){setLoading("");queueMicrotask(()=>{if(!itemResult&&revision()===started)feedback.current?.focus();});}}
  }
  const search=()=>{const form=new FormData();form.set("source",source);form.set("query",query);if(source==="youtube"&&kind==="title")form.set("queryKind","title");void run(lookup,form,source==="youtube"&&kind==="link"?"Looking up YouTube video…":"Searching titles…");};
  const navigation=result?.page;
  return <section className="form-fields" aria-labelledby="lookup-heading"><h3 id="lookup-heading">How would you like to add it?</h3>
    <label htmlFor="lookup-source">Entry method</label><select className="field" id="lookup-source" value={source} onChange={event=>{cancel();setSource(event.target.value);setQuery("");}}><option value="manual">Manual entry</option><option value="youtube">YouTube</option><option value="kinopoisk_unofficial">Кинопоиск Unofficial search</option></select>
    {source!=="manual"&&<><p>Choose a result to fill the details. Edit them, choose moods, then save.</p>{source==="kinopoisk_unofficial"&&<p>Third-party Кинопоиск metadata; availability and rights are unverified.</p>}
      {source==="youtube"&&<><label htmlFor="youtube-kind">YouTube lookup</label><select className="field" id="youtube-kind" value={kind} onChange={event=>{cancel();setKind(event.target.value);setQuery("");}}><option value="link">Video link or ID</option><option value="title">Title search</option></select></>}
      <form onSubmit={event=>{event.preventDefault();search();}}><label htmlFor="lookup-query">{source==="youtube"?(kind==="title"?"YouTube title":"YouTube video link or ID"):"Title to search"}</label><input className="field" id="lookup-query" value={query} onChange={event=>{cancel();setQuery(event.target.value);}}/><button className="button" disabled={Boolean(loading)} type="submit">{source==="youtube"&&kind==="link"?"Look up video":"Search titles"}</button></form>
      {loading&&<button className="button button-secondary" type="button" onClick={cancel}>Cancel lookup</button>}
      <p ref={feedback} tabIndex={-1} role={result?.kind==="failure"?"alert":"status"}>{loading||(result?.kind==="failure"?result.message:result?.kind==="no_match"?"No matching titles on this page. Try another page or continue manually.":result?.kind==="candidates"?"Choose a result from this page.":result?.kind==="available"||result?.kind==="incomplete"?"Lookup finished. Check your form or replacement confirmation below before saving.":"")}</p>
      {!loading&&result?.kind==="candidates"&&<section aria-label="Search results"><h4>Choose the title you meant</h4><ul className="lookup-results">{result.candidates.map(candidate=><li className="lookup-card" key={candidate.identity.externalId}><Cover url={candidate.coverUrl} title={candidate.title} video={source==="youtube"}/><div><h5>{candidate.title??"Title unavailable"}</h5>{candidate.identity.namespace==="youtube"?<p>{candidate.channelTitle??"Channel unknown"} · {durationLabel(candidate.duration?.seconds??null)}</p>:<p>{candidate.year??"Year unknown"} · {contentTypes.find(type=>type.value===candidate.contentType)?.label??"Type needs confirmation"}</p>}<button className="button button-secondary" type="button" onClick={()=>{const form=new FormData();form.set("handle",result.handle!);form.set("candidateId",candidate.identity.externalId);void run(select,form,"Loading selected title…");}}>Review {candidate.title??candidate.identity.externalId}{candidate.identity.namespace==="youtube"?"":` (${candidate.year??"unknown year"})`}</button></div></li>)}</ul></section>}
      {!loading&&navigation&&<nav aria-label="Search pages"><p>Page {navigation.number}{navigation.limitReached?" · Page limit reached. Start a new search to continue.":""}</p>{page&&(["previous","next"] as const).map(direction=>navigation[direction]&&<button className="button button-secondary" key={direction} type="button" onClick={()=>{const form=new FormData();form.set("handle",navigation[direction]!);form.set("direction",direction);void run(page,form,"Loading search page…");}}>{direction==="next"?"Next page":"Previous page"}</button>)}</nav>}
    </>}
  </section>;
}
