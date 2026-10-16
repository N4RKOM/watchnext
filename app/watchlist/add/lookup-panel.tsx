"use client";
import { useRef, useState } from "react";
import type { ReviewResult } from "../../../lib/metadata/reviews";
import type { MetadataItem } from "../../../lib/metadata/types";
import { contentTypes } from "../../../lib/title-state";
type Action = (form: FormData) => Promise<ReviewResult>;
export function LookupPanel({ lookup, select, apply }: { lookup: Action; select: Action; apply: (handle: string, item: MetadataItem) => void }) {
  const [source, setSource] = useState("manual"), [query, setQuery] = useState(""), [result, setResult] = useState<ReviewResult | null>(null), [loading, setLoading] = useState("");
  const generation = useRef(0);
  async function run(action: Action, form: FormData, label: string) {
    const current = ++generation.current; setLoading(label);
    try { const next = await action(form); if (generation.current === current) setResult(next); }
    catch { if (generation.current === current) setResult({ kind: "failure", code: "provider_error", message: "Lookup could not finish. Your details are kept; retry or enter them manually.", retry: "user", retryAfterSeconds: null, manualFallback: true }); }
    finally { if (generation.current === current) setLoading(""); }
  }
  const cancel = () => { generation.current++; setLoading(""); setResult(null); };
  return <section className="form-fields" aria-labelledby="lookup-heading"><h3 id="lookup-heading">How would you like to add it?</h3>
    <label htmlFor="lookup-source">Entry method</label><select className="field" id="lookup-source" value={source} onChange={event => { cancel(); setSource(event.target.value); }}><option value="manual">Manual entry</option><option value="youtube">YouTube link</option><option value="kinopoisk_unofficial">Кинопоиск Unofficial search</option></select>
    {source !== "manual" && <><p>Lookup suggests details for your review. It does not save automatically. Your current details stay until you explicitly apply a proposal.</p>{source === "kinopoisk_unofficial" && <p>Third-party text metadata for this local academic app. Confirm runtime yourself; covers are omitted and account/rights verification is limited.</p>}
      <form onSubmit={event => { event.preventDefault(); const form = new FormData(); form.set("source", source); form.set("query", query); void run(lookup, form, source === "youtube" ? "Looking up YouTube video…" : "Searching Кинопоиск Unofficial…"); }}>
        <label htmlFor="lookup-query">{source === "youtube" ? "YouTube video link or ID" : "Title to search"}</label><input className="field" id="lookup-query" value={query} onChange={event => { cancel(); setQuery(event.target.value); }} />
        <button className="button" disabled={Boolean(loading)} type="submit">{source === "youtube" ? "Look up video" : "Search titles"}</button>
      </form>
      {loading && <button className="button button-secondary" type="button" onClick={cancel}>Cancel lookup</button>}
      <p role={result?.kind === "failure" ? "alert" : "status"}>{loading || (result?.kind === "failure" ? result.message : result?.kind === "no_match" ? "No matching titles. Try another name or continue manually." : "")}</p>
      {!loading && result?.kind === "candidates" && <section><h4>Choose the title you meant</h4><ul>{result.candidates.map(candidate => <li key={candidate.identity.externalId}><p>{candidate.title ?? "Title unavailable"} · {candidate.year ?? "Year unknown"} · {contentTypes.find(type => type.value === candidate.contentType)?.label ?? "Type needs confirmation"}</p><button className="button button-secondary" type="button" onClick={() => { const form = new FormData(); form.set("handle", result.handle!); form.set("candidateId", candidate.identity.externalId); void run(select, form, "Loading selected Кинопоиск title…"); }}>Review {candidate.title ?? candidate.identity.externalId} ({candidate.year ?? "unknown year"})</button></li>)}</ul></section>}
      {!loading && (result?.kind === "available" || result?.kind === "incomplete") && <section className="save-confirmation"><h4>Review lookup proposal</h4><p>{result.item.title ?? "Supply a title"}. {result.item.duration.seconds === null ? "Confirm a finite duration manually." : "Check the full video/movie duration."} Choose your own moods; episodes also need numbering and typical runtime.</p><p>Applying replaces title, type, runtime, genres and links with this proposal. Your mood choices stay. You can edit every field before saving.</p><button className="button" type="button" onClick={() => { apply(result.handle!, result.item); setResult(null); }}>Apply proposal and replace details</button></section>}
    </>}
  </section>;
}
