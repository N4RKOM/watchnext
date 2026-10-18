// @vitest-environment node
import { DatabaseSync } from "node:sqlite";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { migrate } from "../db/migrate";
import { getDatabase } from "../db/server";
import { getGroupRequest } from "../lib/access";
import { createGroup } from "../lib/groups";
import { acceptInvitation, sessionCookieName } from "../lib/sessions";
import { changeProfile } from "../lib/profiles";
import { saveTitleAction } from "../app/watchlist/add/actions";
import { redirect } from "next/navigation";
vi.mock("../db/server", () => ({ getDatabase: vi.fn() }));
vi.mock("../lib/access", () => ({ getGroupRequest: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(() => { throw new Error("FIXTURE_REDIRECT"); }) }));
let db: DatabaseSync;
beforeEach(() => {
  db = new DatabaseSync(":memory:"); migrate(db); vi.mocked(getDatabase).mockReturnValue(db);
  const origin = "https://watch.example"; vi.stubEnv("WATCHNEXT_APP_ORIGIN", origin);
  const credential = acceptInvitation(db, createGroup(db, "A", origin).inviteUrl.split("/").at(-1)!);
  const request = new Request(origin, { method: "POST", headers: { origin, cookie: `${sessionCookieName}=${credential}` } });
  changeProfile(db, request, { intent: "create", name: "Anna", color: "#1d4ed8" }, origin); vi.mocked(getGroupRequest).mockResolvedValue(request);
});
afterEach(() => { db.close(); vi.clearAllMocks(); vi.unstubAllEnvs(); });
const data = () => { const form = new FormData(); for (const [key, value] of Object.entries({ title: "Film", contentType: "movie", minutes: "25", seconds: "", numberingStyle: "none", moods: "funny", genres: "", watchUrl: "" })) form.set(key, value); return form; };
it("redirects successful saves to a generated persisted ID rather than accepting an edit target", async () => {
  const form = data(); form.set("titleId", "forged-target");
  form.set("providerNamespace", "youtube"); form.set("providerId", "untrusted");
  await expect(saveTitleAction(undefined, { kind: "idle" }, form)).rejects.toThrow("FIXTURE_REDIRECT");
  const id = db.prepare("SELECT id FROM titles").get()?.id;
  expect(id).not.toBe("forged-target"); expect(redirect).toHaveBeenCalledWith(`/watchlist/add?saved=${id}`);
  expect(db.prepare("SELECT provider_namespace,provider_id FROM titles").get()).toMatchObject({ provider_namespace: null, provider_id: null });
});
it("maps validation to fields and repeated saves to already-added, with safe retry on storage errors", async () => {
  const form = data(); form.set("title", " "); expect(await saveTitleAction(undefined, { kind: "idle" }, form)).toMatchObject({ kind: "invalid", errors: { title: expect.any(String) } });
  db.exec("CREATE TEMP TRIGGER fixture_failure AFTER INSERT ON contributors BEGIN SELECT RAISE(ABORT,'PRIVATE_SQL_FIXTURE'); END");
  const result = await saveTitleAction(undefined, { kind: "idle" }, data()); expect(result.kind).toBe("error"); expect(JSON.stringify(result)).not.toContain("PRIVATE_SQL_FIXTURE"); expect(redirect).not.toHaveBeenCalled();
  expect(db.prepare("SELECT count(*) AS n FROM titles").get()?.n).toBe(0); db.exec("DROP TRIGGER fixture_failure");
  await expect(saveTitleAction(undefined, { kind: "idle" }, data())).rejects.toThrow("FIXTURE_REDIRECT");
  expect(await saveTitleAction(undefined, { kind: "idle" }, data())).toMatchObject({ kind: "already_added", message: expect.stringContaining("already added") });
});
it("rejects absent access before exposing validation or mutation results", async () => {
  vi.mocked(getGroupRequest).mockResolvedValue(new Request("https://watch.example", { method: "POST", headers: { origin: "https://watch.example" } }));
  expect(await saveTitleAction(undefined, { kind: "idle" }, data())).toEqual({ kind: "error", message: "Your group or selected profile is unavailable. Open your group and select a profile before trying again." });
});
it("returns a manual candidate and redirects confirmed additions to real details, with already-added/archive states", async () => {
  await expect(saveTitleAction(undefined, { kind: "idle" }, data())).rejects.toThrow("FIXTURE_REDIRECT");
  const id = db.prepare("SELECT id FROM titles").get()!.id as string;
  changeProfile(db, await getGroupRequest(), { intent: "create", name: "Max", color: "#0f766e" }, "https://watch.example");
  expect(await saveTitleAction(undefined, { kind: "idle" }, data())).toMatchObject({ kind: "confirmation", id });
  expect(db.prepare("SELECT count(*) AS n FROM contributors").get()?.n).toBe(1);
  const confirm = data(); confirm.set("intent", "confirm"); confirm.set("confirmationId", id);
  await expect(saveTitleAction(undefined, { kind: "idle" }, confirm)).rejects.toThrow("FIXTURE_REDIRECT");
  expect(redirect).toHaveBeenLastCalledWith(`/watchlist/${id}`); expect(db.prepare("SELECT count(*) AS n FROM contributors").get()?.n).toBe(2);
  expect(await saveTitleAction(undefined, { kind: "idle" }, confirm)).toMatchObject({ kind: "already_added", id });
  db.prepare("UPDATE titles SET archived=1 WHERE id=?").run(id);expect(await saveTitleAction(undefined, { kind: "idle" }, data())).toMatchObject({ kind: "restore_confirmation", id });
});
