// @vitest-environment node
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { migrate } from "../db/migrate";
import { getDatabase } from "../db/server";
import { getGroupRequest } from "../lib/access";
import { createGroup } from "../lib/groups";
import { acceptInvitation, sessionCookieName } from "../lib/sessions";
import { profileAction } from "../app/group/actions";
vi.mock("../db/server", () => ({ getDatabase: vi.fn() }));
vi.mock("../lib/access", () => ({ getGroupRequest: vi.fn() }));
let db: DatabaseSync;
beforeEach(() => {
  db = new DatabaseSync(":memory:"); migrate(db);
  vi.mocked(getDatabase).mockReturnValue(db);
  vi.stubEnv("WATCHNEXT_APP_ORIGIN", "https://watch.example");
  const token = createGroup(db, "Fixture", "https://watch.example").inviteUrl.split("/").at(-1)!;
  const credential = acceptInvitation(db, token);
  vi.mocked(getGroupRequest).mockResolvedValue(new Request("https://watch.example", { method: "POST", headers: { origin: "https://watch.example", cookie: `${sessionCookieName}=${credential}` } }));
});
afterEach(() => { db.close(); vi.restoreAllMocks(); vi.unstubAllEnvs(); });
const form = (name = "Anna", color = "#1d4ed8") => { const data = new FormData(); data.set("intent", "create"); data.set("name", name); data.set("color", color); return data; };
it("maps validation to fields and returns the saved selected view on success", async () => {
  expect(await profileAction(undefined, { kind: "idle" }, form(" "))).toMatchObject({ kind: "invalid", errors: { name: expect.any(String) } });
  expect(await profileAction(undefined, { kind: "idle" }, form("Anna", "red"))).toMatchObject({ kind: "invalid", errors: { color: expect.any(String) } });
  expect(await profileAction(undefined, { kind: "idle" }, form())).toMatchObject({ kind: "success", activeMemberId: expect.any(String), members: [{ name: "Anna", color: "#1d4ed8", id: expect.any(String) }] });
});
it("hides database details, rolls back failed activation, and supports retry", async () => {
  db.exec("CREATE TEMP TRIGGER fail_activation BEFORE UPDATE ON group_sessions BEGIN SELECT RAISE(ABORT,'PRIVATE_FIXTURE'); END");
  const result = await profileAction(undefined, { kind: "idle" }, form());
  expect(result.kind).toBe("error"); expect(JSON.stringify(result)).not.toContain("PRIVATE_FIXTURE");
  expect(db.prepare("SELECT count(*) AS count FROM members").get()?.count).toBe(0);
  db.exec("DROP TRIGGER fail_activation");
  expect((await profileAction(undefined, { kind: "idle" }, form())).kind).toBe("success");
});
it("returns generic unavailable access rather than validation or group details", async () => {
  vi.mocked(getGroupRequest).mockResolvedValue(new Request("https://watch.example", { method: "POST", headers: { origin: "https://watch.example" } }));
  expect(await profileAction(undefined, { kind: "idle" }, form(""))).toEqual({ kind: "error", message: "Your group access is unavailable. Open a valid invitation and try again." });
});
