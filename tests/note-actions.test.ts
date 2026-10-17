// @vitest-environment node
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { migrate } from "../db/migrate";
import { createGroup } from "../lib/groups";
import { acceptInvitation, requireSession, sessionCookieName } from "../lib/sessions";
import { changeProfile } from "../lib/profiles";
let db: DatabaseSync, request: Request, memberId: string;
const origin = "https://watch.example";
vi.mock("../db/server", () => ({ getDatabase: () => db }));
vi.mock("../lib/access", () => ({ getGroupRequest: async () => request }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { revalidatePath } from "next/cache";
import { noteAction } from "../app/watchlist/note-actions";
const form = (extra: Record<string, string> = {}) => { const result = new FormData(); for (const [key, value] of Object.entries({ intent: "save_note", memberId, body: " My note\r\nline two ", ...extra })) result.set(key, value); return result; };
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("WATCHNEXT_APP_ORIGIN", origin); db = new DatabaseSync(":memory:"); migrate(db); const cookie = acceptInvitation(db, createGroup(db, "Action fixture", origin).inviteUrl.split("/").at(-1)!);
  request = new Request(origin, { method: "POST", headers: { origin, cookie: `${sessionCookieName}=${cookie}` } }); changeProfile(db, request, { intent: "create", name: "Anna", color: "#1d4ed8" }, origin); const context = requireSession(db, cookie); memberId = context.activeMemberId!;
  db.prepare("INSERT INTO titles(id,group_id,title,title_key,content_type,duration_seconds,numbering_style) VALUES ('title',?,'Series','series','series',1440,'continuous')").run(context.groupId);
});
afterEach(() => { db.close(); vi.unstubAllEnvs(); });
it("real action normalizes/persists/revalidates and blank/explicit clear returns actual absence without progress", async () => {
  expect(await noteAction("title", { kind: "idle" }, form())).toMatchObject({ kind: "saved", note: { memberId, body: "My note\nline two" } }); expect(revalidatePath).toHaveBeenCalledWith("/watchlist/title");
  expect(await noteAction("title", { kind: "idle" }, form({ body: " \r\n\u00a0 " }))).toMatchObject({ kind: "saved", note: { body: null }, message: "Your note is cleared. No notes." });
  expect(await noteAction("title", { kind: "idle" }, form({ intent: "clear_note", body: "ignored unsaved" }))).toMatchObject({ kind: "saved", note: { body: null } }); expect(db.prepare("SELECT * FROM notes").all()).toEqual([]); expect(db.prepare("SELECT * FROM progress").all()).toEqual([]);
});
it("exact supplementary boundary succeeds; NUL, over-limit, nontext and duplicate inputs fail without changing it", async () => {
  const boundary = "😀".repeat(2000); expect((await noteAction("title", { kind: "idle" }, form({ body: boundary }))).note?.body).toBe(boundary);
  for (const body of ["NUL\0text", "😀".repeat(2001)]) expect(await noteAction("title", { kind: "idle" }, form({ body }))).toMatchObject({ kind: "invalid", error: expect.any(String) });
  const file = form(); file.set("body", new Blob(["text"]), "note.txt"); expect((await noteAction("title", { kind: "idle" }, file)).kind).toBe("invalid"); const duplicate = form(); duplicate.append("body", "second"); expect((await noteAction("title", { kind: "idle" }, duplicate)).kind).toBe("invalid"); expect(db.prepare("SELECT body FROM notes").get()?.body).toBe(boundary);
});
it("insert/update/delete failures return safe retry without false success or leaked exception details", async () => {
  for (const phase of ["INSERT", "UPDATE", "DELETE"]) {
    if (phase !== "INSERT") await noteAction("title", { kind: "idle" }, form()); const before = db.prepare("SELECT * FROM notes").all(); db.exec(`CREATE TRIGGER fail_note BEFORE ${phase} ON notes BEGIN SELECT RAISE(ABORT,'PRIVATE SQL PATH C:/private'); END`);
    const result = await noteAction("title", { kind: "idle" }, form(phase === "DELETE" ? { intent: "clear_note" } : { body: "Changed" })); expect(result).toMatchObject({ kind: "error", message: expect.stringContaining("try again") }); expect(JSON.stringify(result)).not.toMatch(/PRIVATE|SQL|private/); expect(db.prepare("SELECT * FROM notes").all()).toEqual(before); db.exec("DROP TRIGGER fail_note");
  }
});
it("wrong member, unsupported authority and archived requests cannot save/clear notes", async () => {
  expect((await noteAction("title", { kind: "idle" }, form({ memberId: "forged" }))).kind).toBe("error"); expect((await noteAction("title", { kind: "idle" }, form({ score: "10" }))).kind).toBe("invalid"); db.exec("UPDATE titles SET archived=1"); for (const intent of ["save_note", "clear_note"]) expect((await noteAction("title", { kind: "idle" }, form({ intent }))).kind).toBe("error"); expect(db.prepare("SELECT * FROM notes").all()).toEqual([]);
});
