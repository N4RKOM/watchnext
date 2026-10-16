"use server";
import { redirect } from "next/navigation";
import { getDatabase } from "../../../db/server";
import { getGroupRequest } from "../../../lib/access";
import { TitleFieldError } from "../../../lib/manual-titles";
import { saveTitle } from "../../../lib/shared-save";
import { AccessError } from "../../../lib/sessions";
import type { ManualTitleInput } from "../../../lib/manual-titles";
import type { TitleFormState } from "../../../lib/title-state";

export async function saveTitleAction(_previous: TitleFormState, form: FormData): Promise<TitleFormState> {
  let destination: string;
  try {
    const input = Object.fromEntries(["title", "contentType", "minutes", "seconds", "numberingStyle", "genres", "watchUrl"].map((key) => [key, form.get(key)])) as ManualTitleInput;
    input.moods = form.getAll("moods");
    if (form.has("groupId")) input.groupId = form.get("groupId");
    if (form.has("memberId")) input.memberId = form.get("memberId");
    const intent = form.get("intent");
    if (intent !== null && intent !== "save" && intent !== "confirm") throw new AccessError();
    const result = saveTitle(getDatabase(), await getGroupRequest(true), { kind: "manual", fields: input,
      ...(intent === "confirm" ? { confirmationId: form.get("confirmationId") } : {}),
    }, process.env.WATCHNEXT_APP_ORIGIN);
    if (result.kind === "confirmation_required") return { ...result, kind: "confirmation" };
    if (result.kind === "archived_match") return { ...result, kind: "archived" };
    if (result.kind === "identity_conflict") return { ...result, kind: "conflict" };
    if (result.kind === "existing" && result.alreadyAdded) return { ...result, kind: "already_added" };
    destination = result.kind === "created" ? `/watchlist/add?saved=${encodeURIComponent(result.id)}` : `/watchlist/${encodeURIComponent(result.id)}`;
  } catch (error) {
    if (error instanceof TitleFieldError) return { kind: "invalid", errors: { [error.field]: error.message } };
    return { kind: "error", message: error instanceof AccessError ? "Your group or selected profile is unavailable. Open your group and select a profile before trying again." : "We couldn’t save your title. Your input is still here. Please try again." };
  }
  redirect(destination);
}
