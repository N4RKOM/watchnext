export const noteLimit = 2000;
export type OwnNote = { memberId: string; body: string | null };
export type NoteState = { kind: "idle" | "saved" | "invalid" | "error"; note?: OwnNote; error?: string; message?: string };
export type NoteAction = (previous: NoteState, form: FormData) => Promise<NoteState>;
/** Identical normalization/count in the server validator and native textarea UI. */
export function inspectNoteDraft(value: string) {
  const normalized = value.replace(/\r\n?/g, "\n").replace(/^[\p{White_Space}\uFEFF]+|[\p{White_Space}\uFEFF]+$/gu, "");
  const count = [...normalized].length;
  return { normalized, count, error: value.includes("\0") ? "Notes cannot contain NUL characters." : count > noteLimit ? "Keep your note within 2000 Unicode code points. Your draft has not been shortened." : undefined };
}
