import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { createIsolatedDemoRoot } from "../../scripts/demo/paths.mjs";
import { prepareDemo } from "../../scripts/demo/prepare.mjs";
import { assertCurrentSchema } from "../../db/migrate.ts";
const repo = fileURLToPath(new URL("../../", import.meta.url));
export function verifyBackup() {
  const root = createIsolatedDemoRoot(); let writer;
  const check = (value, message) => { if (!value) throw new Error(message); };
  const rows = db => JSON.stringify(db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(({ name }) => [name, db.prepare(`SELECT * FROM "${name.replaceAll('"', '""')}"`).all().map(row => JSON.stringify(row)).sort()]));
  const history = db => JSON.stringify(["contributors", "progress", "ratings", "notes", "schema_migrations"].map(table => db.prepare(`SELECT * FROM ${table}`).all().map(row => JSON.stringify(row)).sort()));
  try {
    const prepared = prepareDemo({ testRoot: root, environment: { LOCALAPPDATA: join(root, "normal-local"), XDG_DATA_HOME: join(root, "normal-local") } });
    const backup = join(root, "private backup with spaces.sqlite"), restored = join(root, "separate restored.sqlite"), sentinel = join(root, "unrelated.txt"); writeFileSync(sentinel, "unchanged sentinel");
    writer = new DatabaseSync(prepared.path); writer.exec("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0;");
    const expired = "SyntheticExpiredAcquiredTitleForBackupTest", walNote = "Committed WAL-only user note: preserved through snapshot";
    writer.prepare("UPDATE titles SET title=?,title_key=?,provider_namespace='youtube',provider_id='BackupDemo01' WHERE id='demo-funny-24'").run(expired, expired.toLowerCase());
    for (const field of ["title", "duration"]) writer.prepare("INSERT INTO metadata_fields(title_id,field,origin,retrieved_at,expires_at) VALUES ('demo-funny-24',?,'provider','2020-01-01T00:00:00.000Z','2020-01-31T00:00:00.000Z')").run(field);
    writer.prepare("UPDATE notes SET body=? WHERE title_id='demo-funny-24' AND member_id='demo-anna'").run(walNote);
    check(existsSync(prepared.path + "-wal") && !readFileSync(prepared.path).includes(Buffer.from(walNote)) && readFileSync(prepared.path + "-wal").includes(Buffer.from(walNote)), "Fixture must contain a committed WAL-only record");
    const mainBytes = readFileSync(prepared.path), walBytes = readFileSync(prepared.path + "-wal"), before = rows(writer), originalHistory = history(writer);
    for (const [source, destination] of [[prepared.path, backup], [backup, restored]]) {
      const args = process.env.npm_execpath ? [process.env.npm_execpath, "db:snapshot", source, destination] : [join(repo, "scripts/db/snapshot.mjs"), source, destination];
      const snapshot = spawnSync(process.execPath, args, { cwd: repo, env: process.env, encoding: "utf8", timeout: 15000, windowsHide: true });
      check(snapshot.status === 0 && snapshot.stdout.includes("Consistent snapshot verified"), "The actual documented snapshot/restore command must succeed with quoted paths");
    }
    for (const path of [backup, restored]) { const copy = new DatabaseSync(path, { readOnly: true }); try { assertCurrentSchema(copy); check(rows(copy) === before, "Snapshot/restore must preserve every logical value and original deadline"); } finally { copy.close(); } }
    check(readFileSync(prepared.path).equals(mainBytes) && readFileSync(prepared.path + "-wal").equals(walBytes), "Source main and committed WAL bytes remain unchanged by snapshot/restore");
    const maintenance = spawnSync(process.execPath, [join(repo, "scripts/metadata-maintain.mjs")], { cwd: repo, env: { ...process.env, WATCHNEXT_DATABASE_PATH: restored, YOUTUBE_API_KEY: "", KINOPOISK_UNOFFICIAL_API_KEY: "" }, encoding: "utf8", timeout: 15000, windowsHide: true });
    check(maintenance.status === 0 && maintenance.stdout.includes("expired fields cleared"), "Real offline maintenance must succeed against the restored file");
    const final = new DatabaseSync(restored, { readOnly: true });
    try { check(history(final) === originalHistory, "Expiry must preserve stable IDs, contributors, progress, completion, ratings, notes and migration ledger"); check(final.prepare("SELECT title,duration_seconds FROM titles WHERE id='demo-funny-24'").get().title === null && final.prepare("SELECT duration_seconds FROM titles WHERE id='demo-funny-24'").get().duration_seconds === null, "Expired acquired fields genuinely clear after restore"); check(final.prepare("SELECT expires_at FROM metadata_fields LIMIT 1").get().expires_at === "2020-01-31T00:00:00.000Z", "Restore/maintenance must not renew original deadlines"); check(final.prepare("PRAGMA integrity_check").get().integrity_check === "ok" && final.prepare("PRAGMA foreign_key_check").all().length === 0, "Restored database remains valid"); }
    finally { final.close(); }
    check(!readFileSync(restored).includes(Buffer.from(expired)), "Deleted acquired content must not remain as ordinary restored main-file bytes");
    check(rows(writer) === before && readFileSync(prepared.path).equals(mainBytes) && readFileSync(prepared.path + "-wal").equals(walBytes) && readFileSync(sentinel, "utf8") === "unchanged sentinel", "Maintenance of restored copy must not modify source or unrelated sentinel");
    return { walCommittedSnapshot: true, separateNewRestore: true, sourceMainWalSentinelUnchanged: true, allLogicalRowsAndDeadlinesPreserved: true, actualOfflineExpiry: true, userHistoryAndIdsPreserved: true, expiredMainFileBytesCleared: true, schemaIntegrity: true };
  } finally { writer?.close(); if (dirname(resolve(root)) !== realpathSync.native(tmpdir()) || !/^watchnext-demo-test-[A-Za-z0-9]+$/.test(basename(root))) throw new Error("Unsafe backup fixture cleanup"); rmSync(root, { recursive: true, force: true }); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { if (process.argv.length !== 2) throw new Error("No fixture arguments accepted"); console.log(JSON.stringify({ pass: true, report: verifyBackup(), ownTemporaryDataCleaned: true })); }
  catch { console.error("Backup verification failed. Run the named isolated backup test for safe assertion context; no normal storage was used."); process.exitCode = 1; }
}
