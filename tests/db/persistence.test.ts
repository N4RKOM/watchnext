// @vitest-environment node
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDatabase, getDatabase, initializeDatabase } from "../../db/connection";
import { resolveDatabasePath } from "../../db/config";
import { verifyPersistence } from "../../scripts/db/persistence-check.mjs";

let directory: string;
beforeEach(() => { directory = mkdtempSync(join(tmpdir(), "watchnext-connection-test-")); });
afterEach(() => {
  closeDatabase();
  if (dirname(resolve(directory)) !== resolve(tmpdir()) || !basename(directory).startsWith("watchnext-connection-test-")) {
    throw new Error("Unsafe connection fixture cleanup");
  }
  rmSync(directory, { recursive: true, force: true });
});
const environment = () => ({ WATCHNEXT_DATABASE_PATH: join(directory, "local data", "watchnext.sqlite") });

describe("persistent server database access", () => {
  it("the documented initializer loads an isolated env file and preserves rows on repeat runs", () => {
    const path = join(directory, "command path with spaces", "example.sqlite");
    writeFileSync(join(directory, ".env.local"), `WATCHNEXT_DATABASE_PATH="${path.replaceAll("\\", "/")}"`);
    const env = { ...process.env };
    delete env.WATCHNEXT_DATABASE_PATH;
    const script = fileURLToPath(new URL("../../scripts/db/init.mjs", import.meta.url));
    const initialize = () => spawnSync(process.execPath, ["--env-file-if-exists=.env.local", script], {
      cwd: directory, encoding: "utf8", env,
    });
    const first = initialize();
    expect(first.status, first.stderr).toBe(0);
    expect(first.stdout).toContain("0001_initial.sql");
    getDatabase({ WATCHNEXT_DATABASE_PATH: path }).prepare("INSERT INTO groups(id,name) VALUES ('command','Preserved command fixture')").run();
    closeDatabase();
    const second = initialize();
    expect(second.status, second.stderr).toBe(0);
    expect(second.stdout).toContain("existing data preserved");
    expect(getDatabase({ WATCHNEXT_DATABASE_PATH: path }).prepare("SELECT name FROM groups WHERE id='command'").get()?.name)
      .toBe("Preserved command fixture");
  });
  it("initializes parent directories and preserves rows after reinitialization and close/reopen", () => {
    const env = environment();
    expect(initializeDatabase(env).applied).toEqual(["0001_initial.sql"]);
    const db = getDatabase(env);
    expect(getDatabase(env)).toBe(db);
    expect(db.prepare("PRAGMA foreign_keys").get()?.foreign_keys).toBe(1);
    expect(db.prepare("PRAGMA busy_timeout").get()?.timeout).toBe(5000);
    db.prepare("INSERT INTO groups(id,name) VALUES ('restart','Recognizable local fixture')").run();
    closeDatabase();
    expect(initializeDatabase(env).applied).toEqual([]);
    expect(getDatabase(env).prepare("SELECT name FROM groups WHERE id='restart'").get()?.name).toBe("Recognizable local fixture");
    closeDatabase();
    closeDatabase();
  });

  it("supports the OS-user-data default and a distinct configured file with spaces", () => {
    // Override only the local-user-data base with an isolated directory, never real user data.
    const env = { LOCALAPPDATA: directory, XDG_DATA_HOME: directory };
    // macOS ignores environment overrides; test its resolver separately below.
    if (process.platform !== "darwin") {
      const result = initializeDatabase(env);
      expect(result.path).toBe(join(directory, "WatchNext", "watchnext.sqlite"));
      expect(getDatabase(env).prepare("SELECT count(*) AS count FROM groups").get()?.count).toBe(0);
      expect(() => getDatabase(environment())).toThrow("path changed");
      closeDatabase();
    }
    initializeDatabase(environment());
    expect(getDatabase(environment()).prepare("SELECT count(*) AS count FROM groups").get()?.count).toBe(0);
    expect(resolveDatabasePath({ WATCHNEXT_DATABASE_PATH: "relative folder/database.sqlite" }, directory))
      .toBe(join(directory, "relative folder", "database.sqlite"));
    expect(resolveDatabasePath({}, directory, "darwin", directory))
      .toBe(join(directory, "Library", "Application Support", "WatchNext", "watchnext.sqlite"));
  });

  it("rejects blank, memory, URI and invalid paths without choosing another database", () => {
    for (const path of ["", "  ", ":memory:", "file:test.sqlite", "bad\0name", directory + "/"]) {
      expect(() => initializeDatabase({ WATCHNEXT_DATABASE_PATH: path })).toThrow(/path|directory|unsupported/i);
    }
    expect(() => initializeDatabase({ WATCHNEXT_DATABASE_PATH: directory })).toThrow("not a regular file");
    const parentFile = join(directory, "file-not-a-folder");
    writeFileSync(parentFile, "Sentinel");
    expect(() => initializeDatabase({ WATCHNEXT_DATABASE_PATH: join(parentFile, "db.sqlite") })).toThrow("Cannot open WatchNext database");
    expect(readFileSync(parentFile, "utf8")).toBe("Sentinel");
    expect(() => resolveDatabasePath({ LOCALAPPDATA: "relative", XDG_DATA_HOME: "relative" }, directory, "win32", directory))
      .toThrow("absolute filesystem path");
  });

  it("requires explicit initialization and rejects corrupt/uninitialized files clearly", () => {
    expect(() => getDatabase(environment())).toThrow("db:init");
    const path = environment().WATCHNEXT_DATABASE_PATH;
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, "not sqlite");
    expect(() => getDatabase(environment())).toThrow(/initialize|database/i);
  });

  it("rejects an existing unwritable database file rather than falling back", () => {
    const env = environment();
    initializeDatabase(env);
    chmodSync(env.WATCHNEXT_DATABASE_PATH, 0o444);
    try {
      expect(() => getDatabase(env)).toThrow("Cannot open WatchNext database");
    } finally {
      chmodSync(env.WATCHNEXT_DATABASE_PATH, 0o600);
    }
  });

  it("persists across fresh processes and isolates separately configured files", () => {
    expect(verifyPersistence()).toHaveLength(3);
  });
});
