"use client";
import { useActionState, useEffect, useState } from "react";
import { initials, type Profile } from "../../lib/profile-state";
import type { RatingAction } from "../../lib/rating-state";
export function RatingControls({ member, score, action }: { member: Profile; score: number | null; action: RatingAction }) {
  const [state, submit, pending] = useActionState(action, { kind: "idle" });
  const [value, setValue] = useState(score === null ? "" : String(score));
  const stored = state.rating ? state.rating.score : score;
  useEffect(() => { if (state.kind === "saved" && state.rating) setValue(state.rating.score === null ? "" : String(state.rating.score)); }, [state]);
  return <section className="placeholder" aria-labelledby="rating-heading"><h2 id="rating-heading">Your rating</h2>
    <div className="active-profile"><span className="avatar" style={{ backgroundColor: member.color }} aria-hidden="true">{initials(member.name)}</span><p>Rating as <strong className="profile-name">{member.name}</strong>.</p></div>
    <p>Rate the whole title, including a series or anime, rather than an individual episode. You can rate before marking it complete. Scores are visible to your group and do not affect picks.</p>
    <p>Your saved rating: {stored === null ? "Not rated" : `${stored}/10`}.</p>
    <form action={submit} onReset={event => event.preventDefault()} noValidate aria-busy={pending}>
      <input type="hidden" name="memberId" value={member.id} />
      <fieldset className="form-fields" disabled={pending}><legend className="visually-hidden">Your whole-title score</legend>
        <label htmlFor="rating-score">Rating (1–10)</label><input className="field" id="rating-score" name="score" inputMode="numeric" value={value} onChange={event => setValue(event.target.value)} aria-invalid={state.kind === "invalid"} aria-describedby="rating-hint rating-error" />
        <p id="rating-hint">One whole number from 1 to 10. To remove a score, use Clear my rating.</p><p id="rating-error" className="field-error">{state.kind === "invalid" ? state.error : ""}</p>
        <div className="progress-actions"><button className="button" type="submit" name="intent" value="save_rating">Save rating</button><button className="button button-secondary" type="submit" name="intent" value="clear_rating">Clear my rating</button></div>
      </fieldset><p role={state.kind === "error" || state.kind === "invalid" ? "alert" : "status"}>{pending ? "Saving your rating…" : state.message}</p>
    </form>
  </section>;
}
