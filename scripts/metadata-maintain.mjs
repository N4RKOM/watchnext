import { existsSync, statSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { resolveDatabasePath } from "../db/config.ts";
import { assertCurrentSchema } from "../db/migrate.ts";
import { expireMetadata } from "../lib/metadata/lifecycle.ts";

// Explicit offline maintenance. Tests always supply an initialized temporary path.
let db;
try {
  if (process.argv.length !== 2) throw new Error("No command arguments supported");
  const path = resolveDatabasePath();
  if (!existsSync(path) || !statSync(path).isFile()) throw new Error("Initialize the configured database first");
  db = new DatabaseSync(path); db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;"); assertCurrentSchema(db);
  let count = 0, pending = true;
  for (let batch = 0; batch < 100 && pending; batch++) { const result = expireMetadata(db); count += result.cleared; pending = result.pending; }
  if (pending) throw new Error("More maintenance remains; repeat the command");
  console.log(`Metadata maintenance complete: ${count} expired fields cleared. No provider requests made.`);
} catch { console.error("Metadata maintenance could not finish. Check initialization/configuration and retry; no provider requests were made."); process.exitCode = 1; }
finally { db?.close(); }
