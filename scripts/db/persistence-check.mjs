import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export function verifyPersistence() {
  const root = mkdtempSync(join(tmpdir(), "watchnext-persistence-"));
  const worker = fileURLToPath(new URL("./persistence-worker.mjs", import.meta.url));
  const results = [];
  try {
    for (const [mode, filename, expected] of [
      ["write", "first database.sqlite", "WRITE: Unchanged restart example"],
      ["read", "first database.sqlite", "READ: Unchanged restart example"],
      ["absent", "other database.sqlite", "ABSENT: independent database has no fixture"],
    ]) {
      const result = spawnSync(process.execPath, [worker, mode], {
        encoding: "utf8",
        env: { ...process.env, WATCHNEXT_TEST_ROOT: root, WATCHNEXT_DATABASE_PATH: join(root, filename) },
      });
      assert.equal(result.status, 0, result.stderr || String(result.error));
      assert.ok(result.stdout.includes(expected), result.stdout);
      results.push(expected);
    }
    return results;
  } finally {
    // Verify the absolute recursive-cleanup target before removing this fixture.
    if (dirname(resolve(root)) !== resolve(tmpdir()) || !basename(root).startsWith("watchnext-persistence-")) {
      throw new Error("Unsafe persistence fixture cleanup path");
    }
    rmSync(root, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length > 2) throw new Error("No database arguments accepted; verification creates its own isolated paths");
    for (const result of verifyPersistence()) console.log(`PASS: ${result}`);
    console.log("PASS: separate-process persistence and database isolation; temporary fixtures removed.");
  } catch (error) {
    console.error("FAIL:", error);
    process.exitCode = 1;
  }
}
