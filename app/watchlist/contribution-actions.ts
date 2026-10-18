"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDatabase } from "../../db/server";
import { getGroupRequest } from "../../lib/access";
import { removeOwnContribution, restoreTitle } from "../../lib/contributions";
import { AccessError } from "../../lib/sessions";
import type { ContributionState } from "../../lib/contribution-state";
export async function contributionAction(contextKey: string | undefined, id: string, _previous: ContributionState, form: FormData): Promise<ContributionState> {
  let removalMessage: string | undefined;
  try {
    const claims = { ...(form.has("memberId") ? { memberId: form.get("memberId") } : {}), ...(form.has("groupId") ? { groupId: form.get("groupId") } : {}) };
    const request = await getGroupRequest(true, contextKey), db = getDatabase();
    if (form.get("intent") === "remove_confirm") removalMessage = removeOwnContribution(db, request, id, claims, process.env.WATCHNEXT_APP_ORIGIN).message;
    else if (form.get("intent") === "restore") restoreTitle(db, request, id, claims, process.env.WATCHNEXT_APP_ORIGIN);
    else throw new AccessError();
    revalidatePath("/watchlist");revalidatePath("/archive");revalidatePath(`/watchlist/${id}`);
  } catch (error) { return { kind: "error", message: error instanceof AccessError ? "This action is unavailable for the current profile or title. Reload and check your profile." : "We couldn’t update your contribution. Nothing was changed. Please try again." }; }
  if (removalMessage) return { kind: "success", message: removalMessage };
  redirect(`/watchlist/${encodeURIComponent(id)}?contribution=saved`);
}
