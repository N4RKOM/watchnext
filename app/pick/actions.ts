"use server";
import { getDatabase } from "../../db/server";
import { getGroupRequest } from "../../lib/access";
import { AccessError } from "../../lib/sessions";
import { pickFromForm } from "../../lib/picker/server-only";
import type { PickState } from "../../lib/picker/view-state";
export async function pickAction(form: FormData): Promise<PickState> {
  try { return pickFromForm(getDatabase(), await getGroupRequest(true), form, process.env.WATCHNEXT_APP_ORIGIN); }
  catch (error) {
    return { kind: "error", requestId: typeof form.get("requestId") === "string" ? (form.get("requestId") as string).slice(0, 80) : "", groupId: typeof form.get("groupId") === "string" ? form.get("groupId") as string : "",
      message: error instanceof AccessError ? "Your group access changed or is unavailable. Reload your group before picking again. Your inputs are still here." : "We couldn’t pick right now. Your inputs are still here. Please try again." };
  }
}
