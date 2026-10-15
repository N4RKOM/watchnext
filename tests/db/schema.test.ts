// @vitest-environment node
import { mkdtempSync, readFileSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { migrate, migrationDirectory } from "../../db/migrate";
import { verifySchema } from "../../scripts/db/check.mjs";

describe("SQLite foundation", () => {
  it("satisfies the isolated schema acceptance fixtures", () => {
    expect(verifySchema()).toHaveLength(12);
  });

  it("both isolated CLIs reject a supplied normal-database path without touching it", () => {
    const directory = mkdtempSync(join(tmpdir(), "watchnext-cli-test-"));
    const path = join(directory, "existing.sqlite");
    writeFileSync(path, "SYNTHETIC_NORMAL_DATABASE_SENTINEL");
    try {
      for (const name of ["migrate.mjs", "verify.mjs"]) {
        const script = fileURLToPath(new URL(`../../scripts/db/${name}`, import.meta.url));
        const result = spawnSync(process.execPath, [script, path], { encoding: "utf8" });
        expect(result.status).toBe(1);
        expect(result.stderr).toContain("FAIL:");
        expect(result.stderr).toContain("No path arguments accepted");
        expect(readFileSync(path, "utf8")).toBe("SYNTHETIC_NORMAL_DATABASE_SENTINEL");
      }
    } finally {
      unlinkSync(path);
      rmdirSync(directory);
    }
  });

  it("rolls back a failed migration batch and retries safely after correction", () => {
    const directory = mkdtempSync(join(tmpdir(), "watchnext-migration-test-"));
    const first = join(directory, "0001_test.sql");
    const second = join(directory, "0002_test.sql");
    const db = new DatabaseSync(":memory:");
    try {
      writeFileSync(first, "CREATE TABLE sample(id INTEGER PRIMARY KEY) STRICT;");
      writeFileSync(second, "CREATE TABLE second(id INTEGER); INVALID SQL;");
      expect(() => migrate(db, directory)).toThrow();
      expect(db.prepare("SELECT name FROM sqlite_schema WHERE name IN ('sample','second')").all()).toEqual([]);
      expect(db.prepare("SELECT * FROM schema_migrations").all()).toEqual([]);
      writeFileSync(second, "CREATE TABLE second(id INTEGER) STRICT;");
      expect(migrate(db, directory)).toEqual(["0001_test.sql", "0002_test.sql"]);
      expect(migrate(db, directory)).toEqual([]);
      writeFileSync(first, "CREATE TABLE changed(id INTEGER) STRICT;");
      expect(() => migrate(db, directory)).toThrow("Applied migration changed");
      expect(db.prepare("SELECT count(*) AS count FROM schema_migrations").get()?.count).toBe(2);
    } finally {
      db.close();
      unlinkSync(first);
      unlinkSync(second);
      rmdirSync(directory);
    }
  });

  it("rejects missing history and duplicate versions rather than reapplying files", () => {
    const directory = mkdtempSync(join(tmpdir(), "watchnext-history-test-"));
    const first = join(directory, "0001_test.sql");
    const duplicate = join(directory, "0001_duplicate.sql");
    const db = new DatabaseSync(":memory:");
    try {
      writeFileSync(first, readFileSync(join(migrationDirectory, "0001_initial.sql"), "utf8"));
      migrate(db, directory);
      writeFileSync(duplicate, "SELECT 1;");
      expect(() => migrate(db, directory)).toThrow("Duplicate migration version");
      unlinkSync(duplicate);
      unlinkSync(first);
      writeFileSync(first, "-- Changed filename is checked separately below");
      db.prepare("UPDATE schema_migrations SET filename = '0000_missing.sql'").run();
      expect(() => migrate(db, directory)).toThrow("not a prefix");
    } finally {
      db.close();
      unlinkSync(first);
      rmdirSync(directory);
    }
  });
});
