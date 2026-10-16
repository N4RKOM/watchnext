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
import { ratingAction } from "../app/watchlist/rating-actions";
const form = (extra: Record<string, string> = {}) => { const result = new FormData(); for (const [key, value] of Object.entries({ intent: "save_rating", memberId, score: "8", ...extra })) result.set(key, value); return result; };
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("WATCHNEXT_APP_ORIGIN", origin); db = new DatabaseSync(":memory:"); migrate(db);
  const cookie = acceptInvitation(db, createGroup(db, "Action fixture", origin).inviteUrl.split("/").at(-1)!);
  request = new Request(origin, { method: "POST", headers: { origin, cookie: `${sessionCookieName}=${cookie}` } }); changeProfile(db, request, { intent: "create", name: "Anna", color: "#1d4ed8" }, origin); const context = requireSession(db, cookie); memberId = context.activeMemberId!;
  db.prepare("INSERT INTO titles(id,group_id,title,title_key,content_type,duration_seconds,numbering_style) VALUES ('title',?,'Series','series','series',1440,'continuous')").run(context.groupId);
});
afterEach(() => { db.close(); vi.unstubAllEnvs(); });
it("real save/edit/clear action revalidates attributed history without completion or contribution", async () => {
  expect(await ratingAction("title", { kind: "idle" }, form())).toMatchObject({ kind: "saved", rating: { memberId, score: 8 } }); expect(revalidatePath).toHaveBeenCalledWith("/watchlist/title");
  expect(await ratingAction("title", { kind: "idle" }, form({ score: "10" }))).toMatchObject({ kind: "saved", rating: { score: 10 } });
  expect(await ratingAction("title", { kind: "idle" }, form({ intent: "clear_rating", score: "invalid unsaved value" }))).toMatchObject({ kind: "saved", rating: { score: null } });
  expect(db.prepare("SELECT * FROM ratings").all()).toEqual([]); expect(db.prepare("SELECT * FROM progress").all()).toEqual([]); expect(db.prepare("SELECT * FROM contributors").all()).toEqual([]);
});
it("blank/malformed/nontext/duplicate scores give a specific field error and do not clear", async () => {
  await ratingAction("title", { kind: "idle" }, form());
  for (const score of ["", "0", "11", "7.5", "1e1"]) expect(await ratingAction("title", { kind: "idle" }, form({ score }))).toMatchObject({ kind: "invalid", error: expect.any(String) });
  const file = form(); file.set("score", new Blob(["8"]), "rating.txt"); expect((await ratingAction("title", { kind: "idle" }, file)).kind).toBe("invalid");
  const duplicate = form(); duplicate.append("score", "1"); expect((await ratingAction("title", { kind: "idle" }, duplicate)).kind).toBe("invalid");
  expect(db.prepare("SELECT score FROM ratings").get()?.score).toBe(8);
});
it("insert/update/delete failures return safe retry feedback and never false success", async () => {
  for (const phase of ["INSERT", "UPDATE", "DELETE"]) {
    if (phase !== "INSERT") await ratingAction("title", { kind: "idle" }, form());
    const before = db.prepare("SELECT * FROM ratings").all(); db.exec(`CREATE TRIGGER fail_rating BEFORE ${phase} ON ratings BEGIN SELECT RAISE(ABORT,'PRIVATE SQL PATH C:/private'); END`);
    const result = await ratingAction("title", { kind: "idle" }, form(phase === "DELETE" ? { intent: "clear_rating" } : { score: "9" })); expect(result).toMatchObject({ kind: "error", message: expect.stringContaining("try again") }); expect(JSON.stringify(result)).not.toMatch(/PRIVATE|SQL|private/); expect(db.prepare("SELECT * FROM ratings").all()).toEqual(before); db.exec("DROP TRIGGER fail_rating");
  }
});
it("forged/current-member claims and archived targets are denied before any write", async () => {
  expect(await ratingAction("title", { kind: "idle" }, form({ memberId: "forged" }))).toMatchObject({ kind: "error" }); db.exec("UPDATE titles SET archived=1");
  expect(await ratingAction("title", { kind: "idle" }, form())).toMatchObject({ kind: "error" }); expect(db.prepare("SELECT * FROM ratings").all()).toEqual([]);
});
