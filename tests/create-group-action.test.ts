// @vitest-environment node
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { migrate } from "../db/migrate";
import { getDatabase } from "../db/server";
import { createGroupAction } from "../app/actions/create-group";

vi.mock("../db/server", () => ({ getDatabase: vi.fn() }));
let db: DatabaseSync;
beforeEach(() => {
  db = new DatabaseSync(":memory:"); migrate(db);
  vi.mocked(getDatabase).mockReturnValue(db);
  vi.stubEnv("WATCHNEXT_APP_ORIGIN", "https://watch.example");
});
afterEach(() => { db.close(); vi.restoreAllMocks(); vi.unstubAllEnvs(); });
const data = (name: string) => { const form = new FormData(); form.set("groupName", name); return form; };

it("returns a field error for invalid or file input without database access", async () => {
  vi.mocked(getDatabase).mockClear();
  const blank = await createGroupAction({ kind: "idle" }, data("  "));
  expect(blank.kind).toBe("invalid");
  const nontext = new FormData(); nontext.set("groupName", new Blob(["Synthetic"]), "example.txt");
  expect((await createGroupAction({ kind: "idle" }, nontext)).kind).toBe("invalid");
  expect(getDatabase).not.toHaveBeenCalled();
});

it("returns a safe retryable error for a database failure without URL or sensitive details", async () => {
  db.exec("CREATE TEMP TRIGGER fail_invitation BEFORE INSERT ON invitations BEGIN SELECT RAISE(ABORT, 'PRIVATE_SQL_SENTINEL'); END;");
  const result = await createGroupAction({ kind: "idle" }, data("Retry name"));
  expect(result.kind).toBe("error");
  expect(JSON.stringify(result).includes("PRIVATE_SQL_SENTINEL")).toBe(false);
  expect("inviteUrl" in result).toBe(false);
  expect(db.prepare("SELECT count(*) AS count FROM groups").get()?.count).toBe(0);
  db.exec("DROP TRIGGER fail_invitation");
  expect((await createGroupAction({ kind: "idle" }, data("Retry name"))).kind).toBe("created");
});

it("rejects explicit origin misconfiguration before database access", async () => {
  vi.mocked(getDatabase).mockClear();
  vi.stubEnv("WATCHNEXT_APP_ORIGIN", "https://watch.example/path");
  expect((await createGroupAction({ kind: "idle" }, data("Group"))).kind).toBe("error");
  expect(getDatabase).not.toHaveBeenCalled();
});
