"use server";

import { getDatabase } from "../../db/server";
import { getGroupRequest } from "../../lib/access";
import { changeProfile, ProfileFieldError } from "../../lib/profiles";
import { AccessError } from "../../lib/sessions";
import type { ProfileState } from "../../lib/profile-state";

export async function profileAction(contextKey: string | undefined, _previous: ProfileState, form: FormData): Promise<ProfileState> {
  try {
    const result = changeProfile(getDatabase(), await getGroupRequest(true, contextKey), {
      intent: form.get("intent"), name: form.get("name"), color: form.get("color"), memberId: form.get("memberId"),
      groupId: form.has("groupId") ? form.get("groupId") : undefined,
    }, process.env.WATCHNEXT_APP_ORIGIN);
    return { kind: "success", message: form.get("intent") === "create" ? "Profile created and selected." : "Profile selected.", ...result };
  } catch (error) {
    if (error instanceof ProfileFieldError) return { kind: "invalid", errors: { [error.field]: error.message } };
    return { kind: "error", message: error instanceof AccessError ? "Your group access is unavailable. Open a valid invitation and try again." : "We couldn’t update your profile. Your input is still here. Please try again." };
  }
}
