"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import { MetadataFields, type MetadataValues } from "../title-fields";
import { type TitleFormState } from "../../../lib/title-state";
import { LookupPanel } from "./lookup-panel";
import { reviewValues } from "../../../lib/metadata/review-values";
import type { ReviewResult } from "../../../lib/metadata/reviews";

export function TitleForm({ action, lookup, select }: { action: (previous: TitleFormState, form: FormData) => Promise<TitleFormState>; lookup?: (form: FormData) => Promise<ReviewResult>; select?: (form: FormData) => Promise<ReviewResult> }) {
  const [state, submit, pending] = useActionState(action, { kind: "idle" });
  const [values, setValues] = useState<MetadataValues>({ title: "", contentType: "movie", minutes: "", seconds: "", numberingStyle: "", genres: "", watchUrl: "", sourceUrl: "", coverUrl: "" });
  const [moods, setMoods] = useState<string[]>([]);
  const [reviewHandle, setReviewHandle] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<TitleFormState | null>(null);
  const confirming = (state.kind === "confirmation" || state.kind === "restore_confirmation") && state !== dismissed;
  const errors = state.kind === "invalid" ? state.errors : {};
  const update = (field: keyof typeof values, value: string) => setValues((previous) => ({ ...previous, [field]: value }));
  // React resets action forms after returned validation/error states too. Keep every
  // entered value (including checkbox defaults) until a successful navigation.
  return <>{lookup && select && <fieldset className="form-fields" disabled={pending}><legend className="visually-hidden">Optional metadata lookup</legend><LookupPanel lookup={lookup} select={select} apply={(handle, item) => { setValues(reviewValues(item)); setReviewHandle(handle); setDismissed(state); }} /></fieldset>}
    {reviewHandle && <div><p role="status">A lookup review is active for 10 minutes. Unchanged suggestions keep their provider origin; only your actual corrections become yours.</p><button className="button button-secondary" type="button" disabled={pending} onClick={() => { setValues({ title: "", contentType: "movie", minutes: "", seconds: "", numberingStyle: "", genres: "", watchUrl: "", sourceUrl: "", coverUrl: "" }); setMoods([]); setReviewHandle(null); setDismissed(state); }}>Start a fresh manual entry (clear details)</button></div>}
    <form action={submit} onReset={(event) => event.preventDefault()} noValidate aria-busy={pending}>
    {reviewHandle && <input type="hidden" name="reviewHandle" value={reviewHandle} />}
    <fieldset className="form-fields" disabled={pending}>
      <legend className="visually-hidden">Manual title details</legend>
      <MetadataFields values={values} moods={moods} update={update} setMoods={setMoods} errors={errors} sourceFields={Boolean(reviewHandle)} />
      {confirming && <section className="save-confirmation" aria-labelledby="confirmation-heading"><h3 id="confirmation-heading">{state.kind === "restore_confirmation" ? "Restore this saved title?" : "Is this the title you meant?"}</h3><p className="saved-title-name">{state.title}</p><p>{state.message}</p>
        <input type="hidden" name="confirmationId" value={state.id} />
        <button className="button" type="submit" name="intent" value="confirm">{state.kind === "restore_confirmation" ? "Restore to watchlist" : "Add my name to this title"}</button>{" "}<button className="button button-secondary" type="button" onClick={() => setDismissed(state)}>Return to editing</button>
      </section>}
      {!confirming && <button className="button" type="submit" name="intent" value="save">{pending ? "Saving title…" : "Save title"}</button>}
    </fieldset>
    <p role={state.kind === "error" ? "alert" : "status"} className={state.kind === "error" ? "field-error" : "form-feedback"}>{pending ? "Saving your title…" : state.kind === "error" || state.kind === "already_added" || state.kind === "conflict" ? state.message : confirming ? "Please confirm the existing title or return to editing." : "Add something you’ve been meaning to watch."}</p>
    {(state.kind === "already_added" || state.kind === "conflict") && state.id && <Link href={`/watchlist/${encodeURIComponent(state.id)}`}>View existing details</Link>}
  </form></>;
}
