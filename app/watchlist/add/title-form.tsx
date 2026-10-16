"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import { contentTypes, fixedMoods, type TitleField, type TitleFormState } from "../../../lib/title-state";

export function TitleForm({ action }: { action: (previous: TitleFormState, form: FormData) => Promise<TitleFormState> }) {
  const [state, submit, pending] = useActionState(action, { kind: "idle" });
  const [values, setValues] = useState({ title: "", contentType: "movie", minutes: "", seconds: "", numberingStyle: "", genres: "", watchUrl: "" });
  const [moods, setMoods] = useState<string[]>([]);
  const [dismissed, setDismissed] = useState<TitleFormState | null>(null);
  const confirming = state.kind === "confirmation" && state !== dismissed;
  const episodic = values.contentType === "series" || values.contentType === "anime";
  const errors = state.kind === "invalid" ? state.errors : {};
  const fieldProps = (field: TitleField) => ({ "aria-invalid": Boolean(errors[field]), "aria-describedby": errors[field] ? `${field}-error` : undefined });
  const error = (field: TitleField) => errors[field] ? <p className="field-error" id={`${field}-error`} role="alert">{errors[field]}</p> : null;
  const update = (field: keyof typeof values, value: string) => setValues((previous) => ({ ...previous, [field]: value }));
  // React resets action forms after returned validation/error states too. Keep every
  // entered value (including checkbox defaults) until a successful navigation.
  return <form action={submit} onReset={(event) => event.preventDefault()} noValidate aria-busy={pending}>
    <fieldset className="form-fields" disabled={pending}>
      <legend className="visually-hidden">Manual title details</legend>
      <label className="field-label" htmlFor="title">Title</label>
      <input className="field" id="title" name="title" value={values.title} onChange={(e) => update("title", e.target.value)} {...fieldProps("title")} />{error("title")}
      <label className="field-label" htmlFor="contentType">Content type</label>
      <select className="field" id="contentType" name="contentType" value={values.contentType} onChange={(e) => update("contentType", e.target.value)} {...fieldProps("contentType")}>
        {contentTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
      </select>{error("contentType")}
      <fieldset className="form-fields duration-fields"><legend className="field-label">{episodic ? "Typical episode duration" : "Full duration"}</legend>
        <p className="field-hint">1 second to 24 hours. Use whole minutes and seconds; seconds may be left blank.</p>
        <label htmlFor="minutes">Minutes</label><input className="field" inputMode="numeric" id="minutes" name="minutes" value={values.minutes} onChange={(e) => update("minutes", e.target.value)} {...fieldProps("minutes")} />{error("minutes")}
        <label htmlFor="seconds">Seconds (optional)</label><input className="field" inputMode="numeric" id="seconds" name="seconds" value={values.seconds} onChange={(e) => update("seconds", e.target.value)} {...fieldProps("seconds")} />{error("seconds")}
      </fieldset>
      {episodic ? <><label className="field-label" htmlFor="numberingStyle">Episode numbering</label>
        <select className="field" id="numberingStyle" name="numberingStyle" value={values.numberingStyle} onChange={(e) => update("numberingStyle", e.target.value)} {...fieldProps("numberingStyle")}>
          <option value="">Choose numbering</option><option value="season_episode">Season + episode</option><option value="continuous">Continuous numbering</option>
        </select>{error("numberingStyle")}</> : <input type="hidden" name="numberingStyle" value="none" />}
      <label className="field-label" htmlFor="genres">Genres (optional)</label><p className="field-hint" id="genres-hint">Separate with commas. Up to ten genres, 40 characters each.</p>
      <input className="field" id="genres" name="genres" value={values.genres} onChange={(e) => update("genres", e.target.value)} {...fieldProps("genres")} aria-describedby={`genres-hint${errors.genres ? " genres-error" : ""}`} />{error("genres")}
      <fieldset className="mood-choices" {...fieldProps("moods")}><legend className="field-label">Moods (choose at least one)</legend>
        {fixedMoods.map((mood) => <label className="color-choice" key={mood.value}><input type="checkbox" name="moods" value={mood.value} checked={moods.includes(mood.value)} onChange={(e) => setMoods((previous) => e.target.checked ? [...previous, mood.value] : previous.filter((value) => value !== mood.value))} />{mood.label}</label>)}
      </fieldset>{error("moods")}
      <label className="field-label" htmlFor="watchUrl">External watch link (optional)</label><input className="field" id="watchUrl" name="watchUrl" type="url" value={values.watchUrl} onChange={(e) => update("watchUrl", e.target.value)} {...fieldProps("watchUrl")} />{error("watchUrl")}
      {confirming && <section className="save-confirmation" aria-labelledby="confirmation-heading"><h3 id="confirmation-heading">Is this the title you meant?</h3><p className="saved-title-name">{state.title}</p><p>{state.message}</p>
        <input type="hidden" name="confirmationId" value={state.id} />
        <button className="button" type="submit" name="intent" value="confirm">Add my name to this title</button>{" "}<button className="button button-secondary" type="button" onClick={() => setDismissed(state)}>Return to editing</button>
      </section>}
      {!confirming && <button className="button" type="submit" name="intent" value="save">{pending ? "Saving title…" : "Save title"}</button>}
    </fieldset>
    <p role={state.kind === "error" ? "alert" : "status"} className={state.kind === "error" ? "field-error" : "form-feedback"}>{pending ? "Saving your title…" : state.kind === "error" || state.kind === "already_added" || state.kind === "archived" || state.kind === "conflict" ? state.message : confirming ? "Please confirm the existing title or return to editing." : "Add something you’ve been meaning to watch."}</p>
    {(state.kind === "already_added" || state.kind === "archived" || state.kind === "conflict") && state.id && <Link href={`/watchlist/${encodeURIComponent(state.id)}`}>{state.kind === "archived" ? "View archived details" : "View existing details"}</Link>}
  </form>;
}
