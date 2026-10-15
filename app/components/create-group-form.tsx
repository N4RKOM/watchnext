"use client";

import { useActionState, useState } from "react";
import { initialGroupState, type CreateGroupState } from "../../lib/group-state";

type GroupAction = (state: CreateGroupState, data: FormData) => Promise<CreateGroupState>;

function InvitationResult({ state }: { state: Extract<CreateGroupState, { kind: "created" }> }) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "manual">("idle");
  const [copying, setCopying] = useState(false);
  async function copyLink() {
    setCopying(true);
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(state.inviteUrl);
      setCopyState("copied");
    } catch {
      setCopyState("manual");
    } finally {
      setCopying(false);
    }
  }
  return (
    <section className="group-result" aria-labelledby="created-heading">
      <p className="eyebrow">Group created</p>
      <h2 id="created-heading" className="saved-group-name">{state.name}</h2>
      <p>Keep your invitation link safe. Open it to enter your group, or share it with people you trust.</p>
      <label className="field-label" htmlFor="invite-link">Invite link</label>
      <input id="invite-link" className="field" readOnly value={state.inviteUrl} onFocus={(event) => event.currentTarget.select()} />
      <button className="button button-secondary" type="button" onClick={copyLink} disabled={copying}>
        {copying ? "Copying…" : "Copy invite link"}
      </button>
      <p className="form-feedback" role="status" aria-live="polite">
        {copyState === "copied" ? "Invite link copied." : copyState === "manual" ? "Copying wasn’t available. Select the invite link above and copy it manually." : "Anyone with this link can access the group. Share it only with people you trust."}
      </p>
      {state.loopback && <p className="notice">This link points to this computer. Friends can’t open it on their own computers.</p>}
    </section>
  );
}

export function CreateGroupForm({ action }: { action: GroupAction }) {
  const [state, submit, pending] = useActionState(action, initialGroupState);
  const [name, setName] = useState("");
  const nameError = state.kind === "invalid" ? state.nameError : undefined;
  return (
    <div className="group-entry">
      <section className="placeholder" aria-labelledby="create-heading">
        <h2 id="create-heading">Start your shared watchlist</h2>
        <p>Give your group a name. No signup needed.</p>
        <form action={submit} noValidate aria-busy={pending}>
          <fieldset disabled={pending} className="form-fields">
            <legend className="visually-hidden">Create a group</legend>
            <label className="field-label" htmlFor="group-name">Group name</label>
            <p className="field-hint" id="group-name-hint">1–80 characters. Choose something your friends will recognize.</p>
            <input id="group-name" name="groupName" className="field" value={name} onChange={(event) => setName(event.target.value)}
              required aria-invalid={Boolean(nameError)} aria-describedby={`group-name-hint${nameError ? " group-name-error" : ""}`} />
            {nameError && <p id="group-name-error" className="field-error" role="alert">{nameError}</p>}
            <button className="button" type="submit">{pending ? "Creating group…" : state.kind === "created" ? "Create another group" : state.kind === "error" ? "Try again" : "Create group"}</button>
          </fieldset>
          {pending && <p role="status" className="form-feedback">Saving your group…</p>}
          {state.kind === "error" && !pending && <p className="field-error" role="alert">{state.message}</p>}
        </form>
      </section>
      {state.kind === "created" && !pending && <InvitationResult key={state.inviteUrl} state={state} />}
    </div>
  );
}
