"use server";
import { revalidatePath } from "next/cache";
import { getDatabase } from "../../db/server";
import { getGroupRequest } from "../../lib/access";
import { NoteFieldError, updateOwnNote } from "../../lib/notes";
import type { NoteState } from "../../lib/note-state";
import { AccessError } from "../../lib/sessions";
export async function noteAction(contextKey: string | undefined, id: string, _previous: NoteState, form: FormData): Promise<NoteState> {
  try {
    const input: Record<string, unknown> = Object.create(null);
    for (const [key, value] of form) if (!key.startsWith("$ACTION_")) { if (Object.hasOwn(input, key)) throw new NoteFieldError("Submit one value for each note field."); input[key] = value; }
    const note = updateOwnNote(getDatabase(), await getGroupRequest(true, contextKey), id, input, process.env.WATCHNEXT_APP_ORIGIN);
    revalidatePath(`/watchlist/${encodeURIComponent(id)}`);
    return { kind: "saved", note, message: note.body === null ? "Your note is cleared. No notes." : "Your whole-title note is saved." };
  } catch (error) {
    if (error instanceof NoteFieldError) return { kind: "invalid", error: error.message, message: "Check your note. Nothing was changed." };
    return { kind: "error", message: error instanceof AccessError ? "Your note is unavailable for this profile or title. Reload, choose your profile, and restore archived titles before updating." : "We couldn’t save your note. Your entered draft is kept. Please try again." };
  }
}
