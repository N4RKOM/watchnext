import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

export const migrationDirectory = fileURLToPath(new URL("./migrations/", import.meta.url));

/** Apply immutable ordered SQL files. The caller owns connection lifetime. */
export function migrate(db: DatabaseSync, directory = migrationDirectory): string[] {
  db.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  const files = readdirSync(directory).filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name)).sort();
  if (files.length === 0) throw new Error("No migrations found");
  const versions = files.map((name) => name.slice(0, 4));
  if (new Set(versions).size !== versions.length) throw new Error("Duplicate migration version");
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY, filename TEXT NOT NULL, checksum TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  ) STRICT;`);

  const applied: string[] = [];
  // One transaction for this complete batch: a failure cannot leave half a schema.
  db.exec("BEGIN IMMEDIATE");
  try {
    const previous = db.prepare("SELECT version, filename, checksum FROM schema_migrations ORDER BY version").all();
    for (let index = 0; index < previous.length; index++) {
      if (previous[index].filename !== files[index]) throw new Error("Migration history is not a prefix of available files");
    }
    for (const [index, filename] of files.entries()) {
      const sql = readFileSync(join(directory, filename), "utf8");
      const checksum = createHash("sha256").update(sql.replace(/\r\n/g, "\n")).digest("hex");
      const existing = previous[index];
      if (existing) {
        if (existing.checksum !== checksum) throw new Error(`Applied migration changed: ${filename}`);
        continue;
      }
      db.exec(sql);
      db.prepare("INSERT INTO schema_migrations(version, filename, checksum) VALUES (?, ?, ?)")
        .run(filename.slice(0, 4), filename, checksum);
      applied.push(filename);
    }
    db.exec("COMMIT");
    return applied;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
