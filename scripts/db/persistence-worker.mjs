import assert from "node:assert/strict";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { closeDatabase, getDatabase, initializeDatabase } from "../../db/connection.ts";

try {
  const root = resolve(process.env.WATCHNEXT_TEST_ROOT ?? ".");
  const path = resolve(process.env.WATCHNEXT_DATABASE_PATH ?? ".");
  const offset = relative(root, path);
  if (dirname(root) !== resolve(tmpdir()) || !basename(root).startsWith("watchnext-persistence-") ||
      !offset || isAbsolute(offset) || offset.startsWith("..") || resolve(root, offset) !== path) {
    throw new Error("Persistence worker requires an explicit isolated OS-temp fixture path");
  }
  const mode = process.argv[2];
  if (mode === "write" || mode === "absent") initializeDatabase();
  const db = getDatabase();
  if (mode === "write") {
    db.prepare("INSERT INTO groups(id,name) VALUES (?,?)").run("persistence-fixture", "Unchanged restart example");
    console.log("WRITE: Unchanged restart example");
  } else if (mode === "read") {
    assert.equal(db.prepare("SELECT name FROM groups WHERE id=?").get("persistence-fixture")?.name, "Unchanged restart example");
    console.log("READ: Unchanged restart example");
  } else if (mode === "absent") {
    assert.equal(db.prepare("SELECT name FROM groups WHERE id=?").get("persistence-fixture"), undefined);
    console.log("ABSENT: independent database has no fixture");
  } else throw new Error("Unknown persistence fixture operation");
} catch (error) {
  console.error("FAIL:", error);
  process.exitCode = 1;
} finally {
  closeDatabase();
}
