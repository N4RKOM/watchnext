"use server";
import { revalidatePath } from "next/cache";
import { getDatabase } from "../../db/server";
import { getGroupRequest } from "../../lib/access";
import { EpisodeFieldError, updateEpisodeProgress } from "../../lib/episode-progress";
import type { EpisodeState } from "../../lib/episode-progress-state";
import { AccessError } from "../../lib/sessions";
export async function episodeProgressAction(contextKey: string | undefined, id: string, _previous: EpisodeState, form: FormData): Promise<EpisodeState> {
  try {
    const input: Record<string, unknown> = Object.create(null);
    for (const [key, value] of form) if (!key.startsWith("$ACTION_")) {
      if (Object.hasOwn(input, key)) throw new EpisodeFieldError("positionState", "Submit one value for each progress field.");
      input[key] = value;
    }
    const progress = updateEpisodeProgress(getDatabase(), await getGroupRequest(true, contextKey), id, input, process.env.WATCHNEXT_APP_ORIGIN);
    revalidatePath(`/watchlist/${encodeURIComponent(id)}`);
    return { kind: "saved", progress, message: input.intent === "complete" ? "Marked complete. Your stored episode position is unchanged." : input.intent === "undo_completion" ? "Completion undone. Your stored episode position is unchanged." : "Episode progress saved. Completion is unchanged." };
  } catch (error) {
    if (error instanceof EpisodeFieldError) return { kind: "invalid", errors: { [error.field]: error.message }, message: "Check your episode progress. Nothing was changed." };
    return { kind: "error", message: error instanceof AccessError ? "Progress is unavailable for this profile or title. Reload, choose your profile, and restore archived titles before updating." : "We couldn’t save episode progress. Your entered details are kept. Please try again." };
  }
}
