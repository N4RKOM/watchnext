"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { avatarPalette, initials, initialProfileState, type ProfileState, type ProfileView } from "../../lib/profile-state";

export function ProfilePanel({ initial, action }: { initial: ProfileView; action: (previous: ProfileState, form: FormData) => Promise<ProfileState> }) {
  const [state, submit, pending] = useActionState(action, initialProfileState);
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(avatarPalette[0].value);
  const [lastView, setLastView] = useState(initial);
  useEffect(() => { if (state.kind === "success") setLastView({ members: state.members, activeMemberId: state.activeMemberId }); }, [state]);
  const view = state.kind === "success" ? state : lastView;
  const active = view.members.find((member) => member.id === view.activeMemberId);
  const errors = state.kind === "invalid" ? state.errors : {};
  return <div className="group-entry">
    <section className="placeholder" aria-labelledby="profile-heading">
      <h2 id="profile-heading">Who’s watching?</h2>
      <p>Anyone with the group invitation can select any profile. Names are not authenticated identities.</p>
      {active ? <div className="active-profile"><span className="avatar" style={{ backgroundColor: active.color }} aria-hidden="true">{initials(active.name)}</span><p>Current profile: <strong className="profile-name">{active.name}</strong></p></div> : <p>No profile selected.</p>}
      {active && <Link className="button" href="/watchlist/add">Add title</Link>}
      <form action={submit} aria-busy={pending}>
        <input type="hidden" name="intent" value="select" />
        <fieldset className="form-fields" disabled={pending}>
          <legend className="visually-hidden">Select a profile</legend>
          {view.members.length === 0 ? <p>No profiles yet. Create the first one below.</p> : <ul className="profile-list">
            {view.members.map((member) => <li key={member.id}><button type="submit" name="memberId" value={member.id} className="profile-choice" aria-pressed={member.id === active?.id}>
              <span className="avatar" style={{ backgroundColor: member.color }} aria-hidden="true">{initials(member.name)}</span>
              <span className="profile-name">{member.name}</span>{" "}<span className="profile-indicator">{member.id === active?.id ? "Active" : "Select"}</span>
            </button></li>)}
          </ul>}
        </fieldset>
      </form>
    </section>
    <section className="placeholder" aria-labelledby="create-profile-heading">
      <h2 id="create-profile-heading">Create a profile</h2>
      <form action={submit} noValidate aria-busy={pending}>
        <input type="hidden" name="intent" value="create" />
        <fieldset className="form-fields" disabled={pending}>
          <legend className="visually-hidden">New profile</legend>
          <label className="field-label" htmlFor="profile-name">Your name</label>
          <p className="field-hint" id="profile-name-hint">1–40 characters. Choose a name your friends recognize.</p>
          <input className="field" id="profile-name" name="name" value={name} onChange={(event) => setName(event.target.value)} aria-invalid={Boolean(errors.name)} aria-describedby={`profile-name-hint${errors.name ? " profile-name-error" : ""}`} />
          {errors.name && <p className="field-error" id="profile-name-error" role="alert">{errors.name}</p>}
          <fieldset className="color-palette" aria-invalid={Boolean(errors.color)} aria-describedby={errors.color ? "profile-color-error" : undefined}>
            <legend className="field-label">Avatar color</legend>
            {avatarPalette.map((choice) => <label className="color-choice" key={choice.value}><input type="radio" name="color" value={choice.value} checked={color === choice.value} onChange={() => setColor(choice.value)} />
              <span className="color-swatch" style={{ backgroundColor: choice.value }} aria-hidden="true" />{choice.name}
            </label>)}
          </fieldset>
          {errors.color && <p className="field-error" id="profile-color-error" role="alert">{errors.color}</p>}
          <button type="submit" className="button">{pending ? "Updating profile…" : "Create and select profile"}</button>
        </fieldset>
      </form>
    </section>
    <p role={state.kind === "error" ? "alert" : "status"} className={state.kind === "error" ? "field-error" : "form-feedback"} aria-live="polite">
      {pending ? "Updating your profile…" : state.kind === "success" ? state.message : state.kind === "error" ? state.message : "Choose your profile above, or create a new one."}
    </p>
  </div>;
}
