import { closeSync, existsSync, lstatSync, openSync, realpathSync, unlinkSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { assertCurrentSchema } from "../../db/migrate.ts";
export class SnapshotError extends Error {}
function plain(path) {
  if (typeof path !== "string" || !isAbsolute(path) || path.includes("\0") || /^file:|^[\\/]{2}/i.test(path)) throw new SnapshotError("Use explicit absolute local filesystem paths, not URIs or network shares.");
  for (let part = resolve(path); ; part = dirname(part)) {
    try { const stat = lstatSync(part); if (stat.isSymbolicLink() || (stat.isFile() && stat.nlink !== 1) || realpathSync.native(part).toLowerCase() !== part.toLowerCase()) throw new SnapshotError("Linked or redirected snapshot paths are unsupported."); }
    catch (error) { if (error?.code !== "ENOENT") throw error; }
    if (dirname(part) === part) break;
  }
  return resolve(path);
}
/** SQLite-consistent new-file snapshot; no normal-path defaults or source maintenance. */
export function createSnapshot(source, destination, hooks = {}) {
  source = plain(source); destination = plain(destination);
  for (const suffix of ["-wal", "-shm", "-journal"]) { plain(source + suffix); plain(destination + suffix); }
  if (!existsSync(source) || !lstatSync(source).isFile()) throw new SnapshotError("The explicit source must be an existing regular database file.");
  if (!existsSync(dirname(destination)) || !lstatSync(dirname(destination)).isDirectory()) throw new SnapshotError("Create the new destination's parent directory first.");
  if (source.toLowerCase() === destination.toLowerCase() || existsSync(destination) || ["-wal", "-shm", "-journal"].some(suffix => existsSync(destination + suffix))) throw new SnapshotError("Snapshot/restore destination and sidecars must not already exist; the original is never overwritten.");
  let db, reserved;
  try {
    db = new DatabaseSync(source, { readOnly: true }); db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL;"); assertCurrentSchema(db);
    if (db.prepare("PRAGMA integrity_check").get().integrity_check !== "ok" || db.prepare("PRAGMA foreign_key_check").all().length) throw new SnapshotError("Source integrity/constraints must pass before snapshot.");
    closeSync(openSync(destination, "wx", 0o600)); reserved = lstatSync(destination);
    hooks.beforeSnapshot?.();
    const current = lstatSync(destination); if (current.ino !== reserved.ino || current.dev !== reserved.dev || current.nlink !== 1 || current.isSymbolicLink()) throw new SnapshotError("Snapshot reservation changed; refusing output.");
    db.prepare("VACUUM INTO ?").run(destination);
    const check = new DatabaseSync(destination, { readOnly: true });
    try { assertCurrentSchema(check); if (check.prepare("PRAGMA integrity_check").get().integrity_check !== "ok" || check.prepare("PRAGMA foreign_key_check").all().length) throw new SnapshotError("Snapshot integrity verification failed."); }
    finally { check.close(); }
    return { source, destination };
  } catch (error) {
    if (reserved && existsSync(destination)) { const current = lstatSync(destination); if (current.ino === reserved.ino && current.dev === reserved.dev && current.nlink === 1 && !current.isSymbolicLink()) unlinkSync(destination); }
    throw error;
  } finally { db?.close(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 4) throw new SnapshotError("Usage: pnpm db:snapshot '<absolute source>' '<new absolute destination>'");
    const result = createSnapshot(process.argv[2], process.argv[3]); console.log(`Consistent snapshot verified: ${result.destination}\nSource unchanged. Original provenance/deadlines preserved; maintain the restored file before use. Keep this private and outside Git.`);
  } catch (error) { console.error(error instanceof SnapshotError ? error.message : "Snapshot failed safely. Check paths, current migration history, stopped writers and disk space. No source maintenance or overwrite was performed."); process.exitCode = 1; }
}
