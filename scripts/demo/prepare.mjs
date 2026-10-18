import { randomBytes } from "node:crypto";
import { closeSync, existsSync, lstatSync, openSync, readSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { migrate } from "../../db/migrate.ts";
import { credentialHash } from "../../lib/sessions.ts";
import { resolveAppOrigin } from "../../lib/groups.ts";
import { demoPaths, validateOwnedDemo, DemoSafetyError } from "./paths.mjs";
import { demo, seedBaseline } from "./fixture.mjs";
const applicationId = 0x574e444d;
function assertOwner(db, marker) {
  try { const row = db.prepare("SELECT owner_id FROM demo_ownership WHERE singleton=1").get(); if (db.prepare("PRAGMA application_id").get().application_id !== applicationId || row?.owner_id !== marker.id) throw new Error(); }
  catch { throw new DemoSafetyError("Refusing a database without matching demo ownership."); }
}
export function prepareDemo(options = {}) {
  if (Object.keys(options).some(key => !["environment", "testRoot", "reset", "showInvite", "beforeCommit"].includes(key))) throw new DemoSafetyError("Unsupported demo setup option; paths cannot be supplied.");
  const environment = options.environment ?? process.env, paths = demoPaths(options), marker = validateOwnedDemo(paths, true);
  const origin = resolveAppOrigin(environment.WATCHNEXT_APP_ORIGIN);
  if (!origin.loopback) throw new DemoSafetyError("Demo invitation output requires a local loopback app origin.");
  const existing = existsSync(paths.path);
  if (existing) {
    const header = Buffer.alloc(100), descriptor = openSync(paths.path, "r"); let bytes;
    try { bytes = readSync(descriptor, header, 0, 100, 0); } finally { closeSync(descriptor); }
    if (bytes < 100 || header.readUInt32BE(68) !== applicationId) throw new DemoSafetyError("Refusing an unrelated or uninitialized database in demo storage.");
    const check = new DatabaseSync(paths.path, { readOnly: true }); try { assertOwner(check, marker); } finally { check.close(); }
  } else closeSync(openSync(paths.path, "wx", 0o600));
  validateOwnedDemo(paths);
  const identity = lstatSync(paths.path), db = new DatabaseSync(paths.path);
  try {
    if (identity.ino !== lstatSync(paths.path).ino || identity.dev !== lstatSync(paths.path).dev) throw new DemoSafetyError("Demo file identity changed during setup.");
    migrate(db);
    if (!existing) {
      db.exec("BEGIN IMMEDIATE");
      try { db.exec(`PRAGMA application_id=${applicationId}; CREATE TABLE demo_ownership(singleton INTEGER PRIMARY KEY CHECK(singleton=1),owner_id TEXT NOT NULL,baseline_ready INTEGER NOT NULL CHECK(baseline_ready IN (0,1)));`); db.prepare("INSERT INTO demo_ownership VALUES (1,?,0)").run(marker.id); db.exec("COMMIT"); }
      catch (error) { db.exec("ROLLBACK"); throw error; }
    }
    assertOwner(db, marker); validateOwnedDemo(paths);
    const prepared = db.prepare("SELECT baseline_ready FROM demo_ownership WHERE singleton=1").get().baseline_ready === 1;
    const token = !prepared || options.reset || options.showInvite ? randomBytes(32).toString("base64url") : null;
    db.exec("BEGIN IMMEDIATE");
    try {
      assertOwner(db, marker);
      if (!prepared || options.reset) { seedBaseline(db, credentialHash(token)); db.exec("UPDATE demo_ownership SET baseline_ready=1 WHERE singleton=1"); }
      if (options.showInvite) {
        db.prepare("DELETE FROM group_sessions WHERE group_id=?").run(demo.group);
        const changed = db.prepare("UPDATE invitations SET token_hash=?,revoked_at=NULL WHERE id=? AND group_id=?").run(credentialHash(token), demo.invitation, demo.group);
        if (changed.changes !== 1) throw new Error("Demo invitation missing");
      }
      options.beforeCommit?.(db); db.exec("COMMIT");
    } catch (error) { db.exec("ROLLBACK"); throw error; }
    return { path: paths.path, status: options.reset ? "reset" : prepared ? "already_prepared" : "prepared", groupName: demo.groupName, members: ["Anna", "Max"], origin: origin.origin,
      ...(options.showInvite ? { inviteUrl: `${origin.origin}/invite/${token}` } : {}) };
  } finally { db.close(); }
}
const quote = value => `'${value.replaceAll("'", "''")}'`;
export function runDemoCommand(args, options = {}) {
  if (args.some(arg => !["--reset", "--show-invite"].includes(arg)) || new Set(args).size !== args.length) throw new DemoSafetyError("Use only --reset and/or --show-invite. Demo paths cannot be supplied on the command line.");
  const result = prepareDemo({ ...options, reset: args.includes("--reset"), showInvite: args.includes("--show-invite") });
  const lines = [result.status === "already_prepared" ? "Already prepared. Demonstration edits preserved; use --reset to restore the baseline." : result.status === "reset" ? "Demo baseline reset atomically." : "Synthetic demo prepared.",
    `Demo database: ${result.path}`, `Fictional group: ${result.groupName}; members: ${result.members.join(", ")}.`,
    "PowerShell startup (repository root; these explicit settings do not rewrite environment files):", `$env:WATCHNEXT_DATABASE_PATH = ${quote(result.path)}`, `$env:WATCHNEXT_APP_ORIGIN = ${quote(result.origin)}`, "pnpm dev", "Or after pnpm build:", "pnpm start"];
  if (result.inviteUrl) lines.push("PRIVATE one-off demo invite (renewed; earlier links and sessions no longer work):", result.inviteUrl);
  else lines.push("Use pnpm demo:prepare --show-invite for an explicit private one-off invitation.");
  return lines.join("\n");
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(runDemoCommand(process.argv.slice(2))); }
  catch (error) { console.error(error instanceof DemoSafetyError ? error.message : "Demo preparation failed. No baseline changes were committed. Check owned local storage and retry."); process.exitCode = 1; }
}
