"use client";
import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import type { ContributionAction } from "../../lib/contribution-state";
export function ContributionControls({ archived, canRemove, memberId, action }: { archived: boolean; canRemove: boolean; memberId: string | null; action: ContributionAction }) {
  const [state, submit, pending] = useActionState(action, { kind: "idle" }), [confirming, setConfirming] = useState(false);
  useEffect(() => { if (state.kind === "success") setConfirming(false); }, [state]);
  return <div className="contribution-controls">
    {archived && !memberId ? <Link href="/group">Choose profile to restore</Link> : (archived || canRemove) && <form action={submit} aria-busy={pending}><input type="hidden" name="memberId" value={memberId!} /><fieldset className="form-fields" disabled={pending}><legend className="visually-hidden">Manage your contribution</legend>
      {archived ? <button className="button" type="submit" name="intent" value="restore">{pending ? "Restoring…" : "Restore to watchlist"}</button> : confirming ? <section className="save-confirmation" aria-labelledby="remove-heading"><h3 id="remove-heading">Remove your contribution?</h3><p>Your name will be removed. If nobody remains, this title will be archived. Everyone’s progress, ratings and notes will stay preserved.</p><button className="button" type="submit" name="intent" value="remove_confirm">{pending ? "Removing…" : "Confirm removal"}</button>{" "}<button className="button button-secondary" type="button" onClick={() => setConfirming(false)}>Cancel removal</button></section> : <button className="button button-secondary" type="button" onClick={() => setConfirming(true)}>Remove my contribution</button>}
    </fieldset></form>}
    <p role={state.kind === "error" ? "alert" : "status"} className={state.kind === "error" ? "field-error" : "form-feedback"}>{pending ? "Updating your contribution…" : state.kind === "idle" ? "" : state.message}</p>
  </div>;
}
