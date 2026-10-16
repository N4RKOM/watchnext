"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { MetadataFields, type MetadataValues } from "../../title-fields";
import type { EditableTitle, EditState } from "../../../../lib/edit-title-state";
export function EditForm({ initial, action }: { initial: EditableTitle; action: (previous: EditState, form: FormData) => Promise<EditState> }) {
  const [values, setValues] = useState(initial.values), [moods, setMoods] = useState(initial.moods);
  const [state, submit, pending] = useActionState(action, { kind: "idle" }), [dismissed, setDismissed] = useState<EditState | null>(null);
  const confirming = state.kind === "confirmation" && state !== dismissed;
  const update = (field: keyof MetadataValues, value: string) => setValues((previous) => ({ ...previous, [field]: value }));
  return <form action={submit} onReset={(event) => event.preventDefault()} noValidate aria-busy={pending}><input type="hidden" name="revision" value={initial.revision} />
    <fieldset className="form-fields" disabled={pending}><legend className="visually-hidden">Edit shared title metadata</legend>
      <MetadataFields values={values} moods={moods} update={update} setMoods={setMoods} errors={state.kind === "invalid" ? state.errors : {}} sourceFields />
      {confirming ? <section className="save-confirmation" aria-labelledby="identity-heading"><h2 id="identity-heading">Change this shared entry’s identity?</h2><p className="saved-title-name">{state.title}</p><p>{state.message}</p><input type="hidden" name="confirmation" value={state.confirmation} />
        <button className="button" type="submit" name="intent" value="confirm">Confirm identity change</button>{" "}<button className="button button-secondary" type="button" onClick={() => setDismissed(state)}>Return to editing</button>
      </section> : <button className="button" type="submit" name="intent" value="save">{pending ? "Saving changes…" : "Save changes"}</button>}
    </fieldset>
    <p role={state.kind === "error" || state.kind === "stale" ? "alert" : "status"} className={state.kind === "error" || state.kind === "stale" ? "field-error" : "form-feedback"}>{pending ? "Saving your changes…" : state.kind === "error" || state.kind === "stale" ? state.message : confirming ? "Confirm the proposed identity change or return to editing." : "Changes affect the shared title. Personal history is preserved."}</p>
    {state.kind === "stale" && <a className="button" href={`/watchlist/${encodeURIComponent(initial.id)}/edit`}>Reload current data</a>}{" "}<Link href={`/watchlist/${encodeURIComponent(initial.id)}`}>Cancel and return to details</Link>
  </form>;
}
