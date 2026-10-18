"use server";
import { redirect } from "next/navigation";
import { getDatabase } from "../../../../db/server";
import { getGroupRequest } from "../../../../lib/access";
import { editTitle, EditUrlError } from "../../../../lib/edit-title";
import { TitleFieldError, type ManualTitleInput } from "../../../../lib/title-validation";
import { AccessError } from "../../../../lib/sessions";
import type { EditState } from "../../../../lib/edit-title-state";
export async function editTitleAction(contextKey: string | undefined, id: string, _previous: EditState, form: FormData): Promise<EditState> {
  try {
    const fields = Object.fromEntries(["title", "contentType", "minutes", "seconds", "numberingStyle", "genres", "watchUrl"].map((key) => [key, form.get(key)])) as ManualTitleInput;
    fields.moods = form.getAll("moods");
    if (form.has("groupId")) fields.groupId = form.get("groupId");if (form.has("memberId")) fields.memberId = form.get("memberId");
    const intent = form.get("intent");if (intent !== null && intent !== "save" && intent !== "confirm") throw new AccessError();
    const result = editTitle(getDatabase(), await getGroupRequest(true, contextKey), id, { fields, sourceUrl: form.get("sourceUrl"), coverUrl: form.get("coverUrl"), revision: form.get("revision"),
      ...(intent === "confirm" ? { confirmation: form.get("confirmation") } : {}),
      immutableClaims: ["id", "titleId", "providerNamespace", "providerId", "provider_namespace", "provider_id", "createdAt", "created_at", "archived", "group_id"].filter((field) => form.has(field)),
    }, process.env.WATCHNEXT_APP_ORIGIN);
    if (result.kind !== "saved") return result;
  } catch (error) {
    if (error instanceof TitleFieldError || error instanceof EditUrlError) return { kind: "invalid", errors: { [error.field]: error.message } };
    return { kind: "error", message: error instanceof AccessError ? "Editing is unavailable for this profile or title. Return to details and check your selected profile." : "We couldn’t save these changes. Your input is still here. Please try again." };
  }
  redirect(`/watchlist/${encodeURIComponent(id)}`);
}
