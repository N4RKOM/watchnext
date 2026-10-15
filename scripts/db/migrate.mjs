import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { migrate } from "../../db/migrate.ts";

// This task's CLI deliberately cannot target a normal user database.
try {
  if (process.argv.length > 2) throw new Error("No path arguments accepted; this command creates an isolated temporary database");
  const path = join(mkdtempSync(join(tmpdir(), "watchnext-schema-")), "schema.sqlite");
  const db = new DatabaseSync(path);
  try {
    const applied = migrate(db);
    console.log(`PASS: migrated isolated database ${path}`);
    console.log(`Applied: ${applied.join(", ") || "none"}`);
    console.table(db.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name").all());
  } finally {
    db.close();
  }
} catch (error) {
  console.error("FAIL:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
