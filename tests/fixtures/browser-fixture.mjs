import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { initializeDatabase } from "../../db/connection.ts";
/** Test-only isolated production server/browser lifecycle; never imported by the app. */
export async function withBrowserFixture(kind, run) {
  if (!/^[a-z]+$/.test(kind)) throw new Error("Invalid fixture kind");
  const repo = fileURLToPath(new URL("../../", import.meta.url)), prefix = `watchnext-${kind}-browser-`;
  const root = mkdtempSync(join(tmpdir(), prefix)), path = join(root, "browser.sqlite"), secrets = [];
  let db, browser, child, logs = "", phase = "initialize";
  const check = (ok, message) => { if (!ok) throw new Error(message); };
  const files = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(join(directory, entry.name)) : [join(directory, entry.name)]);
  try {
    check(Boolean(process.env.WATCHNEXT_BROWSER_MODULE && process.env.WATCHNEXT_BROWSER_EXECUTABLE), "Explicit installed browser runtime required");
    initializeDatabase({ WATCHNEXT_DATABASE_PATH: path }); db = new DatabaseSync(path); db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;");
    const net = createServer(); await new Promise(done => net.listen(0, "127.0.0.1", done)); const port = net.address().port; await new Promise(done => net.close(done)); const origin = `http://127.0.0.1:${port}`;
    const runtime = await import(pathToFileURL(process.env.WATCHNEXT_BROWSER_MODULE).href), chromium = runtime.chromium ?? runtime.default?.chromium;
    child = spawn(process.execPath, ["--import", pathToFileURL(join(repo, "scripts/framework-privacy.mjs")).href, join(repo, "node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", String(port)], { cwd: repo, windowsHide: true, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, WATCHNEXT_DATABASE_PATH: path, WATCHNEXT_APP_ORIGIN: origin, YOUTUBE_API_KEY: "", KINOPOISK_UNOFFICIAL_API_KEY: "", NEXT_TELEMETRY_DISABLED: "1" } });
    child.stdout.on("data", data => { logs += data; }); child.stderr.on("data", data => { logs += data; });
    let ready = false; for (let tries = 0; tries < 100; tries++) { try { if ((await fetch(origin)).ok) { ready = true; break; } } catch {} if (child.exitCode !== null) break; await new Promise(done => setTimeout(done, 100)); }
    if (!ready) throw new Error(`Isolated server failed to start: ${logs}`);
    browser = await chromium.launch({ executablePath: process.env.WATCHNEXT_BROWSER_EXECUTABLE, headless: true, args: ["--disable-background-networking", "--no-first-run"] });
    const createContext = async width => { const context = await browser.newContext({ viewport: { width, height: 900 } }); await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort()); return context; };
    const report = await run({ db, origin, root, secrets, check, createContext, phase: value => { phase = value; } });
    phase = "privacy audit"; check(!secrets.some(secret => logs.includes(secret)), "No raw fixture credentials in routine output");
    for (const file of [...files(join(repo, ".next")), path]) { const buffer = readFileSync(file); check(!secrets.some(secret => buffer.includes(Buffer.from(secret))), "No raw fixture credentials in generated artifacts/database"); }
    console.log(JSON.stringify({ pass: true, report, privacyScan: true }));
    if (process.env.WATCHNEXT_BROWSER_INSPECT === "1") { console.log(JSON.stringify({ inspectionRoot: root })); await new Promise(done => setTimeout(done, 20000)); }
  } catch (error) {
    let message = error instanceof Error ? error.message : "Unknown fixture failure"; for (const secret of secrets) message = message.split(secret).join("<redacted>"); message = message.replace(/\/invite\/[A-Za-z0-9_-]+/g, "/invite/<redacted>"); console.error(`${kind} browser check failed during ${phase}: ${message.slice(0, 900)}`); process.exitCode = 1;
  } finally {
    await browser?.close(); db?.close(); if (child && child.exitCode === null) { child.kill(); await new Promise(done => { child.once("exit", done); setTimeout(done, 5000).unref(); }); }
    if (dirname(resolve(root)) !== resolve(tmpdir()) || !basename(root).startsWith(prefix)) throw new Error("Unsafe fixture cleanup"); rmSync(root, { recursive: true, force: true });
  }
}
