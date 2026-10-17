"use client";
import { useActionState, useEffect, useState } from "react";
import { initials, type Profile } from "../../lib/profile-state";
import { inspectNoteDraft, noteLimit, type NoteAction } from "../../lib/note-state";
export function NoteControls({ member, body, action }: { member: Profile; body: string | null; action: NoteAction }) {
  const [state, submit, pending] = useActionState(action, { kind: "idle" });
  const [draft, setDraft] = useState(body ?? ""), [submittedDraft, setSubmittedDraft] = useState<string | null>(null);
  const check = inspectNoteDraft(draft), error = check.error ?? (state.kind === "invalid" && submittedDraft === draft ? state.error : undefined), stored = state.note ? state.note.body : body;
  useEffect(() => { if (state.kind === "saved" && state.note) setDraft(state.note.body ?? ""); }, [state]);
  return <section className="placeholder" aria-labelledby="note-heading"><h2 id="note-heading">Your note</h2>
    <div className="active-profile"><span className="avatar" style={{ backgroundColor: member.color }} aria-hidden="true">{initials(member.name)}</span><p>Writing as <strong className="profile-name">{member.name}</strong>.</p></div>
    <p>This is a whole-title note, including for series or anime. Your group can read it. Notes are plain text and do not affect picks.</p>
    <p>{stored === null ? "No notes saved for your profile." : "Your saved note is visible in Member history below."}</p>
    <form action={submit} onSubmit={() => setSubmittedDraft(draft)} onReset={event => event.preventDefault()} noValidate aria-busy={pending}>
      <input type="hidden" name="memberId" value={member.id} />
      <fieldset className="form-fields" disabled={pending}><legend className="visually-hidden">Your whole-title plain-text note</legend>
        <label htmlFor="note-body">Your note text</label><textarea className="field note-editor" id="note-body" name="body" rows={6} value={draft} onChange={event => setDraft(event.target.value)} aria-invalid={Boolean(error)} aria-describedby="note-hint note-count note-error" />
        <p id="note-hint">Up to 2000 Unicode code points. Outer whitespace is trimmed; internal spacing and line breaks stay. Saving blank or whitespace-only text clears your stored note. Clear my note discards the unsaved draft and removes only your note.</p>
        <p id="note-count" role="status">{check.count} / {noteLimit} Unicode code points after normalization and trimming.</p><p id="note-error" className="field-error" role={error ? "alert" : undefined}>{error}</p>
        <div className="progress-actions"><button className="button" type="submit" name="intent" value="save_note">Save note</button><button className="button button-secondary" type="submit" name="intent" value="clear_note">Clear my note</button></div>
      </fieldset><p role={state.kind === "error" || state.kind === "invalid" ? "alert" : "status"}>{pending ? "Saving your note…" : state.message}</p>
    </form>
  </section>;
}
