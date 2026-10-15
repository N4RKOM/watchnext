"use server";

import { getDatabase } from "../../db/server";
import { createGroup, GroupNameError, resolveAppOrigin, validateGroupName } from "../../lib/groups";
import type { CreateGroupState } from "../../lib/group-state";

export async function createGroupAction(_previous: CreateGroupState, formData: FormData): Promise<CreateGroupState> {
  const rawName = formData.get("groupName");
  try {
    validateGroupName(rawName);
  } catch (error) {
    return { kind: "invalid", nameError: error instanceof GroupNameError ? error.message : "Enter a valid group name." };
  }
  try {
    // Validate explicit configuration before opening a database; never infer it from Host headers.
    resolveAppOrigin(process.env.WATCHNEXT_APP_ORIGIN);
  } catch {
    return { kind: "error", message: "The invitation link address isn’t configured correctly. Ask the person running WatchNext to check WATCHNEXT_APP_ORIGIN, then try again." };
  }
  try {
    return { kind: "created", ...createGroup(getDatabase(), rawName, process.env.WATCHNEXT_APP_ORIGIN) };
  } catch {
    // Do not log exceptions or return SQL, local paths, or invitation credentials.
    return { kind: "error", message: "We couldn’t save your group. Check that local storage is ready, then try again. Your name is still here." };
  }
}
