"use server";
import { revalidatePath } from "next/cache";
import { getDatabase } from "../../db/server";
import { getGroupRequest } from "../../lib/access";
import { TimestampFieldError, updateWatchProgress } from "../../lib/watch-progress";
import type { WatchState } from "../../lib/watch-progress-state";
import { AccessError } from "../../lib/sessions";
export async function watchProgressAction(id: string, _previous: WatchState, form: FormData): Promise<WatchState> {
  try {
    const input: Record<string, unknown> = Object.create(null);
    for (const [key, value] of form) if (!key.startsWith("$ACTION_")) { if (Object.hasOwn(input, key)) throw new TimestampFieldError("Submit one value for each watch progress field."); input[key] = value; }
    const progress = updateWatchProgress(getDatabase(), await getGroupRequest(true), id, input, process.env.WATCHNEXT_APP_ORIGIN);
    revalidatePath(`/watchlist/${encodeURIComponent(id)}`);
    return { kind: "saved", progress, message: input.intent === "complete" ? "Marked complete. Your stored timestamp is unchanged." : input.intent === "undo_completion" ? "Completion undone. Your stored timestamp is unchanged." : input.intent === "clear_timestamp" || progress.timestampSeconds === null ? "Timestamp cleared. Completion is unchanged." : "Timestamp saved. Completion is unchanged." };
  } catch (error) {
    if (error instanceof TimestampFieldError) return { kind: "invalid", error: error.message, message: "Check Stopped at. Nothing was changed." };
    return { kind: "error", message: error instanceof AccessError ? "Watch progress is unavailable for this profile or title. Reload, choose your profile, and restore archived titles before updating." : "We couldn’t save watch progress. Your entered timestamp is kept. Please try again." };
  }
}
