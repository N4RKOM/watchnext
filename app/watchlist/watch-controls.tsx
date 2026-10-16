"use client";
import { useActionState, useEffect, useState } from "react";
import { formatWatchTimestamp, type WatchAction, type WatchProgress } from "../../lib/watch-progress-state";
export function WatchControls({ initial, name, action }: { initial: WatchProgress; name: string; action: WatchAction }) {
  const [state, submit, pending] = useActionState(action, { kind: "idle" });
  const [timestamp, setTimestamp] = useState(formatWatchTimestamp(initial.timestampSeconds));
  const stored = state.progress ?? initial;
  useEffect(() => { if (state.kind === "saved" && state.progress) setTimestamp(formatWatchTimestamp(state.progress.timestampSeconds)); }, [state]);
  return <section className="placeholder" aria-labelledby="watch-progress-heading"><h2 id="watch-progress-heading">Your watch progress</h2>
    <p>Editing as <strong>{name}</strong>. Progress is manual; watching externally does not update it.</p>
    <p>Saved timestamp: {formatWatchTimestamp(stored.timestampSeconds) || "Not recorded"}. Completion: {stored.completed ? "Finished" : "Not finished"}.</p>
    {stored.beyondDuration && <p className="timestamp-warning">Your saved timestamp is beyond the current full duration. It is preserved; correct or clear it when ready.</p>}
    {!stored.runtimeAvailable && <p id="watch-runtime-notice">Full duration is unavailable, so a new timestamp cannot be validated. Your saved position and completion are preserved. Restore usable metadata to enter a timestamp; clearing and completion remain available.</p>}
    <form action={submit} onReset={event => event.preventDefault()} noValidate aria-busy={pending}>
      <input type="hidden" name="memberId" value={initial.memberId} /><input type="hidden" name="numberingStyle" value="none" />
      <fieldset className="form-fields" disabled={pending}><legend className="visually-hidden">Your manual timestamp and completion</legend>
        <label htmlFor="watch-timestamp">Stopped at</label><input className="field" id="watch-timestamp" name="timestamp" value={timestamp} onChange={event => setTimestamp(event.target.value)} readOnly={!stored.runtimeAvailable} aria-invalid={state.kind === "invalid"} aria-describedby={`watch-timestamp-hint watch-timestamp-error${!stored.runtimeAvailable ? " watch-runtime-notice" : ""}`} />
        <p id="watch-timestamp-hint">Use M:SS or H:MM:SS, for example 12:05 or 1:10:00. Blank means no timestamp; 0:00 means the beginning.</p>
        <p className="field-error" id="watch-timestamp-error">{state.kind === "invalid" ? state.error : ""}</p>
        <div className="progress-actions"><button className="button" type="submit" name="intent" value="save_timestamp" disabled={!stored.runtimeAvailable}>Save timestamp</button><button className="button button-secondary" type="submit" name="intent" value="clear_timestamp">Clear timestamp</button><button className="button button-secondary" type="submit" name="intent" value={stored.completed ? "undo_completion" : "complete"}>{stored.completed ? "Undo completion" : "Mark complete"}</button></div>
      </fieldset><p role={state.kind === "error" || state.kind === "invalid" ? "alert" : "status"}>{pending ? "Saving watch progress…" : state.message}</p>
    </form>
  </section>;
}
