"use client";
import { useActionState, useEffect, useState } from "react";
import type { EpisodeAction, EpisodeProgress } from "../../lib/episode-progress-state";
export function EpisodeControls({ initial, name, unavailable, action }: { initial: EpisodeProgress; name: string; unavailable: boolean; action: EpisodeAction }) {
  const [state, submit, pending] = useActionState(action, { kind: "idle" });
  const [position, setPosition] = useState(initial.positionState), [season, setSeason] = useState(initial.nextSeason === null ? "" : String(initial.nextSeason)), [episode, setEpisode] = useState(initial.nextEpisode === null ? "" : String(initial.nextEpisode));
  const stored = state.progress ?? initial, errors = state.kind === "invalid" ? state.errors ?? {} : {};
  useEffect(() => { if (state.kind === "saved" && state.progress) { setPosition(state.progress.positionState); setSeason(state.progress.nextSeason === null ? "" : String(state.progress.nextSeason)); setEpisode(state.progress.nextEpisode === null ? "" : String(state.progress.nextEpisode)); } }, [state]);
  return <section className="placeholder" aria-labelledby="episode-progress-heading"><h2 id="episode-progress-heading">Your episode progress</h2>
    <p>Editing as <strong>{name}</strong>. Record the next episode to watch. Season changes are entered manually.</p>
    {unavailable && <p>Title metadata is unavailable. Your saved episode structure and history remain; you can still correct your own position.</p>}
    <p>Saved position: {!stored.recorded ? "Unknown / Not recorded" : stored.positionState === "unknown" ? "Unknown" : `${stored.positionState === "not_started" ? "Not started — " : "Next: "}${stored.nextSeason === null ? "" : `Season ${stored.nextSeason}, `}episode ${stored.nextEpisode}`}. Completion: {stored.completed ? "Finished" : "Not finished"}.</p>
    <form action={submit} onReset={event => event.preventDefault()} noValidate aria-busy={pending}>
      <input type="hidden" name="memberId" value={initial.memberId} /><input type="hidden" name="numberingStyle" value={initial.numberingStyle} />
      <fieldset className="form-fields" disabled={pending}><legend className="visually-hidden">Your episode position and completion</legend>
        <label htmlFor="episode-state">Episode position</label><select className="field" id="episode-state" name="positionState" value={position} onChange={event => setPosition(event.target.value as typeof position)} aria-invalid={Boolean(errors.positionState)} aria-describedby="episode-state-hint episode-state-error"><option value="unknown">Unknown</option><option value="not_started">Not started</option><option value="in_progress">In progress</option></select>
        <p id="episode-state-hint">Unknown clears coordinates. Not started explicitly sets {initial.numberingStyle === "season_episode" ? "season 1, episode 1" : "episode 1"}. Neither changes completion.</p>
        <p id="episode-state-error" className="field-error">{errors.positionState}</p>
        {position === "in_progress" && <>{initial.numberingStyle === "season_episode" && <><label htmlFor="next-season">Next season to watch</label><input className="field" id="next-season" name="nextSeason" inputMode="numeric" value={season} onChange={event => setSeason(event.target.value)} aria-invalid={Boolean(errors.nextSeason)} aria-describedby="episode-coordinate-hint next-season-error" /><p id="next-season-error" className="field-error">{errors.nextSeason}</p></>}
          <label htmlFor="next-episode">Next episode to watch</label><input className="field" id="next-episode" name="nextEpisode" inputMode="numeric" value={episode} onChange={event => setEpisode(event.target.value)} aria-invalid={Boolean(errors.nextEpisode)} aria-describedby="episode-coordinate-hint next-episode-error" /><p id="next-episode-error" className="field-error">{errors.nextEpisode}</p><p id="episode-coordinate-hint">Whole numbers from 1 to 9999. This is the next episode, not the last watched.</p></>}
        <button className="button" type="submit" name="intent" value="save_position">Save episode progress</button>
        <button className="button button-secondary" type="submit" name="intent" value={stored.completed ? "undo_completion" : "complete"}>{stored.completed ? "Undo completion" : "Mark complete"}</button>
      </fieldset>
      <p role={state.kind === "error" || state.kind === "invalid" ? "alert" : "status"}>{pending ? "Saving episode progress…" : state.message}</p>
    </form>
  </section>;
}
