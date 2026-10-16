"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import { MetadataFields, type MetadataValues } from "../title-fields";
import { type TitleFormState } from "../../../lib/title-state";

export function TitleForm({ action }: { action: (previous: TitleFormState, form: FormData) => Promise<TitleFormState> }) {
  const [state, submit, pending] = useActionState(action, { kind: "idle" });
  const [values, setValues] = useState<MetadataValues>({ title: "", contentType: "movie", minutes: "", seconds: "", numberingStyle: "", genres: "", watchUrl: "", sourceUrl: "", coverUrl: "" });
  const [moods, setMoods] = useState<string[]>([]);
  const [dismissed, setDismissed] = useState<TitleFormState | null>(null);
  const confirming = (state.kind === "confirmation" || state.kind === "restore_confirmation") && state !== dismissed;
  const errors = state.kind === "invalid" ? state.errors : {};
  const update = (field: keyof typeof values, value: string) => setValues((previous) => ({ ...previous, [field]: value }));
  // React resets action forms after returned validation/error states too. Keep every
  // entered value (including checkbox defaults) until a successful navigation.
  return <form action={submit} onReset={(event) => event.preventDefault()} noValidate aria-busy={pending}>
    <fieldset className="form-fields" disabled={pending}>
      <legend className="visually-hidden">Manual title details</legend>
      <MetadataFields values={values} moods={moods} update={update} setMoods={setMoods} errors={errors} />
      {confirming && <section className="save-confirmation" aria-labelledby="confirmation-heading"><h3 id="confirmation-heading">{state.kind === "restore_confirmation" ? "Restore this saved title?" : "Is this the title you meant?"}</h3><p className="saved-title-name">{state.title}</p><p>{state.message}</p>
        <input type="hidden" name="confirmationId" value={state.id} />
        <button className="button" type="submit" name="intent" value="confirm">{state.kind === "restore_confirmation" ? "Restore to watchlist" : "Add my name to this title"}</button>{" "}<button className="button button-secondary" type="button" onClick={() => setDismissed(state)}>Return to editing</button>
      </section>}
      {!confirming && <button className="button" type="submit" name="intent" value="save">{pending ? "Saving title…" : "Save title"}</button>}
    </fieldset>
    <p role={state.kind === "error" ? "alert" : "status"} className={state.kind === "error" ? "field-error" : "form-feedback"}>{pending ? "Saving your title…" : state.kind === "error" || state.kind === "already_added" || state.kind === "conflict" ? state.message : confirming ? "Please confirm the existing title or return to editing." : "Add something you’ve been meaning to watch."}</p>
    {(state.kind === "already_added" || state.kind === "conflict") && state.id && <Link href={`/watchlist/${encodeURIComponent(state.id)}`}>View existing details</Link>}
  </form>;
}
