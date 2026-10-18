"use server";
import { revalidatePath } from "next/cache";
import { getDatabase } from "../../db/server";
import { getGroupRequest } from "../../lib/access";
import { RatingFieldError, updateOwnRating } from "../../lib/ratings";
import type { RatingState } from "../../lib/rating-state";
import { AccessError } from "../../lib/sessions";
export async function ratingAction(contextKey: string | undefined, id: string, _previous: RatingState, form: FormData): Promise<RatingState> {
  try {
    const input: Record<string, unknown> = Object.create(null);
    for (const [key, value] of form) if (!key.startsWith("$ACTION_")) { if (Object.hasOwn(input, key)) throw new RatingFieldError("Submit one value for each rating field."); input[key] = value; }
    const rating = updateOwnRating(getDatabase(), await getGroupRequest(true, contextKey), id, input, process.env.WATCHNEXT_APP_ORIGIN);
    revalidatePath(`/watchlist/${encodeURIComponent(id)}`);
    return { kind: "saved", rating, message: input.intent === "clear_rating" ? "Your rating is cleared. Not rated." : "Your whole-title rating is saved." };
  } catch (error) {
    if (error instanceof RatingFieldError) return { kind: "invalid", error: error.message, message: "Check your rating. Nothing was changed." };
    return { kind: "error", message: error instanceof AccessError ? "Your rating is unavailable for this profile or title. Reload, choose your profile, and restore archived titles before updating." : "We couldn’t save your rating. Your entered score is kept. Please try again." };
  }
}
