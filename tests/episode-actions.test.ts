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
import { episodeProgressAction } from "../app/watchlist/episode-actions";
const form = (extra: Record<string, string> = {}) => { const value = new FormData(); for (const [key, input] of Object.entries({ intent: "save_position", memberId, numberingStyle: "continuous", positionState: "in_progress", nextEpisode: "3", ...extra })) value.set(key, input); return value; };
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("WATCHNEXT_APP_ORIGIN", origin); db = new DatabaseSync(":memory:"); migrate(db);
  const cookie = acceptInvitation(db, createGroup(db, "Action fixture", origin).inviteUrl.split("/").at(-1)!);
  request = new Request(origin, { method: "POST", headers: { origin, cookie: `${sessionCookieName}=${cookie}` } });
  changeProfile(db, request, { intent: "create", name: "Anna", color: "#1d4ed8" }, origin); const session = requireSession(db, cookie); memberId = session.activeMemberId!;
  db.prepare("INSERT INTO titles(id,group_id,title,title_key,content_type,duration_seconds,numbering_style) VALUES ('title',?,'Anime','anime','anime',1440,'continuous')").run(session.groupId);
});
afterEach(() => { db.close(); vi.unstubAllEnvs(); });
it("real actions persist/revalidate own position and independently mark/undo completion", async () => {
  expect(await episodeProgressAction("title", { kind: "idle" }, form())).toMatchObject({ kind: "saved", progress: { nextEpisode: 3 } });
  expect(revalidatePath).toHaveBeenCalledWith("/watchlist/title");
  expect(await episodeProgressAction("title", { kind: "idle" }, form({ intent: "complete", nextEpisode: "17" }))).toMatchObject({ kind: "saved", progress: { completed: true, nextEpisode: 3 } });
  expect(await episodeProgressAction("title", { kind: "idle" }, form({ intent: "undo_completion" }))).toMatchObject({ kind: "saved", progress: { completed: false, nextEpisode: 3 } });
});
it("returns useful associated validation for nontext/invalid coordinates and rejected timestamp fields", async () => {
  expect(await episodeProgressAction("title", { kind: "idle" }, form({ nextEpisode: "1e2" }))).toMatchObject({ kind: "invalid", errors: { nextEpisode: expect.any(String) } });
  const file = form(); file.set("nextEpisode", new Blob(["3"]), "position.txt");
  expect(await episodeProgressAction("title", { kind: "idle" }, file)).toMatchObject({ kind: "invalid", errors: { nextEpisode: expect.any(String) } });
  expect(await episodeProgressAction("title", { kind: "idle" }, form({ timestamp_seconds: "10" }))).toMatchObject({ kind: "invalid", errors: { positionState: expect.any(String) } });
  const repeated = form(); repeated.append("nextEpisode", "8"); expect((await episodeProgressAction("title", { kind: "idle" }, repeated)).kind).toBe("invalid");
  expect(db.prepare("SELECT * FROM progress").all()).toEqual([]);
});
it("safe storage retry and stale-profile access failures reveal no SQL, path or credential", async () => {
  db.exec("CREATE TRIGGER fail_episode BEFORE INSERT ON progress BEGIN SELECT RAISE(ABORT,'PRIVATE SQL PATH C:/private'); END");
  const result = await episodeProgressAction("title", { kind: "idle" }, form()); expect(result).toMatchObject({ kind: "error", message: expect.stringContaining("try again") }); expect(JSON.stringify(result)).not.toMatch(/PRIVATE|SQL|private/);
  expect(db.prepare("SELECT * FROM progress").all()).toEqual([]);
  db.exec("DROP TRIGGER fail_episode");
  expect(await episodeProgressAction("title", { kind: "idle" }, form({ memberId: "forged" }))).toMatchObject({ kind: "error", message: expect.stringContaining("profile") });
  expect(db.prepare("SELECT * FROM progress").all()).toEqual([]);
});
