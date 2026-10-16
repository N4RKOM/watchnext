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
import { watchProgressAction } from "../app/watchlist/watch-actions";
const form = (extra: Record<string, string> = {}) => { const value = new FormData(); for (const [key, input] of Object.entries({ intent: "save_timestamp", memberId, numberingStyle: "none", timestamp: "1:10:00", ...extra })) value.set(key, input); return value; };
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("WATCHNEXT_APP_ORIGIN", origin); db = new DatabaseSync(":memory:"); migrate(db);
  const cookie = acceptInvitation(db, createGroup(db, "Action fixture", origin).inviteUrl.split("/").at(-1)!);
  request = new Request(origin, { method: "POST", headers: { origin, cookie: `${sessionCookieName}=${cookie}` } });
  changeProfile(db, request, { intent: "create", name: "Anna", color: "#1d4ed8" }, origin); const context = requireSession(db, cookie); memberId = context.activeMemberId!;
  db.prepare("INSERT INTO titles(id,group_id,title,title_key,content_type,duration_seconds,numbering_style) VALUES ('title',?,'Movie','movie','movie',5400,'none')").run(context.groupId);
});
afterEach(() => { db.close(); vi.unstubAllEnvs(); });
it("real actions persist/revalidate timestamp, completion/undo and clear independently", async () => {
  expect(await watchProgressAction("title", { kind: "idle" }, form())).toMatchObject({ kind: "saved", progress: { timestampSeconds: 4200, completed: false, fullDurationSeconds: 5400 } });
  expect(revalidatePath).toHaveBeenCalledWith("/watchlist/title");
  db.exec("UPDATE titles SET duration_seconds=3600");
  expect(await watchProgressAction("title", { kind: "idle" }, form({ intent: "complete", timestamp: "invalid" }))).toMatchObject({ kind: "saved", progress: { timestampSeconds: 4200, completed: true, beyondDuration: true } });
  expect(await watchProgressAction("title", { kind: "idle" }, form({ intent: "undo_completion" }))).toMatchObject({ kind: "saved", progress: { timestampSeconds: 4200, completed: false } });
  expect(await watchProgressAction("title", { kind: "idle" }, form({ intent: "clear_timestamp" }))).toMatchObject({ kind: "saved", progress: { timestampSeconds: null, completed: false } });
});
it("nontext/duplicate/invalid/out-of-range values and episode fields give safe field validation", async () => {
  for (const extra of [{ timestamp: "1e2:00" }, { timestamp: "1:30:01" }, { nextEpisode: "3" }] as Record<string, string>[]) expect(await watchProgressAction("title", { kind: "idle" }, form(extra))).toMatchObject({ kind: "invalid", error: expect.any(String) });
  const file = form(); file.set("timestamp", new Blob(["3:00"]), "position.txt"); expect((await watchProgressAction("title", { kind: "idle" }, file)).kind).toBe("invalid");
  const duplicate = form(); duplicate.append("timestamp", "0:00"); expect((await watchProgressAction("title", { kind: "idle" }, duplicate)).kind).toBe("invalid");
  expect(db.prepare("SELECT * FROM progress").all()).toEqual([]);
});
it("storage/access errors keep prior state and serialize no private exception details", async () => {
  db.exec("CREATE TRIGGER fail_watch BEFORE INSERT ON progress BEGIN SELECT RAISE(ABORT,'PRIVATE SQL PATH C:/private'); END");
  const result = await watchProgressAction("title", { kind: "idle" }, form()); expect(result).toMatchObject({ kind: "error", message: expect.stringContaining("try again") }); expect(JSON.stringify(result)).not.toMatch(/PRIVATE|SQL|private/);
  expect(db.prepare("SELECT * FROM progress").all()).toEqual([]); db.exec("DROP TRIGGER fail_watch");
  expect(await watchProgressAction("title", { kind: "idle" }, form({ memberId: "forged" }))).toMatchObject({ kind: "error", message: expect.stringContaining("profile") });
});
