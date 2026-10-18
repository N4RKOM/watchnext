import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { randomUUID } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { initializeDatabase } from "../../db/connection.ts";

// Real isolated browser harness; optional external installed test runtime, never an app route.
const repo = fileURLToPath(new URL("../../", import.meta.url));
const root = mkdtempSync(join(tmpdir(), "watchnext-metadata-browser-")), path = join(root, "browser.sqlite");
const secrets = [randomUUID(), randomUUID()]; let browser, child, logs = "", phase = "initialize", db;
const check = (ok, label) => { if (!ok) throw new Error(label); };
const net = createServer(); await new Promise(done => net.listen(0, "127.0.0.1", done)); const port = net.address().port; await new Promise(done => net.close(done));
const origin = `http://127.0.0.1:${port}`;
const files = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(join(directory, entry.name)) : [join(directory, entry.name)]);
const report = [];
try {
  check(Boolean(process.env.WATCHNEXT_BROWSER_MODULE && process.env.WATCHNEXT_BROWSER_EXECUTABLE), "Explicit installed browser runtime required");
  initializeDatabase({ WATCHNEXT_DATABASE_PATH: path });
  const runtime = await import(pathToFileURL(process.env.WATCHNEXT_BROWSER_MODULE).href);
  const chromium = runtime.chromium ?? runtime.default?.chromium;
  check(Boolean(chromium), "Installed runtime must expose Chromium browser automation");
  child = spawn(process.execPath, ["--import", pathToFileURL(join(repo, "scripts/framework-privacy.mjs")).href, "--import", pathToFileURL(join(repo, "tests/fixtures/metadata-browser-preload.mjs")).href, join(repo, "node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: repo, windowsHide: true, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, WATCHNEXT_DATABASE_PATH: path, WATCHNEXT_APP_ORIGIN: origin, YOUTUBE_API_KEY: secrets[0], KINOPOISK_UNOFFICIAL_API_KEY: secrets[1], NEXT_TELEMETRY_DISABLED: "1" },
  });
  child.stdout.on("data", data => { logs += data.toString(); }); child.stderr.on("data", data => { logs += data.toString(); });
  let ready = false;
  for (let tries = 0; tries < 100; tries++) { try { if ((await fetch(origin)).ok) { ready = true; break; } } catch {} if (child.exitCode !== null) break; await new Promise(done => setTimeout(done, 100)); }
  if (!ready) throw new Error(`Isolated production server did not become ready: ${logs}`);
  browser = await chromium.launch({ executablePath: process.env.WATCHNEXT_BROWSER_EXECUTABLE, headless: true, args: ["--disable-background-networking", "--no-first-run"] });
  for (const width of [375, 1280]) {
    phase = `browser ${width}`;
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const page = await context.newPage(); await page.goto(origin);
    await page.getByLabel("Group name", { exact: true }).fill(`Browser fixture ${width}`); await page.getByRole("button", { name: "Create group", exact: true }).click();
    const invite = await page.getByLabel("Invite link", { exact: true }).inputValue(); secrets.push(invite.split("/").at(-1)); await page.goto(invite); await page.waitForURL("**/group");
    for (const cookie of await context.cookies()) if(cookie.name !== "watchnext_access_mode") secrets.push(cookie.value);
    await page.getByLabel("Your name", { exact: true }).fill("Anna"); await page.getByRole("button", { name: "Create and select profile", exact: true }).click(); await page.getByRole("link", { name: "Add title", exact: true }).click();
    await page.getByLabel("Title", { exact: true }).fill("Manual draft preserved"); await page.getByLabel("Entry method").selectOption("youtube");
    await page.getByLabel("YouTube video link or ID").fill("YtQuota0001"); await page.getByRole("button", { name: "Look up video" }).press("Enter"); await page.getByRole("alert").filter({ hasText: "quota" }).waitFor();
    check(await page.getByLabel("Title", { exact: true }).inputValue() === "Manual draft preserved", "Failure must preserve manual input");
    await page.getByLabel("YouTube video link or ID").fill("https://youtu.be/YtFixture01?t=30"); await page.getByRole("button", { name: "Look up video" }).press("Enter"); await page.getByRole("button", { name: "Apply proposal and replace details" }).waitFor();
    check(await page.getByLabel("Title", { exact: true }).inputValue() === "Manual draft preserved", "Proposal must be staged");
    await page.getByRole("button", { name: "Apply proposal and replace details" }).press("Enter");
    secrets.push(await page.locator('input[name="reviewHandle"]').inputValue());
    await page.getByLabel("Funny", { exact: true }).check(); await page.getByRole("button", { name: "Save title", exact: true }).press("Enter"); await page.waitForURL("**/watchlist/add?saved=*");
    await page.getByRole("heading", { name: "Title saved", exact: true }).waitFor(); check((await page.locator(".saved-summary").innerText()).includes("Browser YouTube video"), "Real YouTube save/readback");
    await page.reload(); await page.getByRole("heading", { name: "Title saved", exact: true }).waitFor();
    await page.getByRole("link", { name: "Open details, refresh or correct metadata" }).click();
    await page.waitForURL(url => /^\/watchlist\/[0-9a-f-]{36}$/.test(url.pathname));
    const id = new URL(page.url()).pathname.split("/").at(-1);
    db = new DatabaseSync(path); db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;");
    check(db.prepare("UPDATE metadata_fields SET expires_at='2000-01-01T00:00:00.000Z' WHERE title_id=? AND origin='provider'").run(id).changes > 0, "Fixture must expire the actual persisted title"); db.close(); db = undefined;
    await page.reload(); await page.getByRole("heading", { name: "Metadata unavailable", exact: true }).waitFor();
    check((await page.locator("main").innerText()).includes("Duration unavailable"), "Expired duration must be genuinely unavailable");
    await page.getByRole("button", { name: "Refresh imported metadata" }).press("Enter"); await page.getByRole("heading", { name: "Browser YouTube video", exact: true }).waitFor();
    await page.goto(origin + "/watchlist/add"); await page.getByLabel("Entry method").selectOption("kinopoisk_unofficial"); await page.getByLabel("Title to search").fill("ambiguous"); await page.getByRole("button", { name: "Search titles" }).press("Enter");
    await page.getByRole("button", { name: "Review Browser shared title (2020)", exact: true }).waitFor();
    check(await page.getByLabel("Title", { exact: true }).inputValue() === "", "Candidates must not fill or auto-save");
    await page.getByRole("button", { name: "Review Browser shared title (2020)", exact: true }).press("Enter"); await page.getByRole("button", { name: "Apply proposal and replace details" }).press("Enter");
    secrets.push(await page.locator('input[name="reviewHandle"]').inputValue());
    check(await page.getByLabel("Minutes", { exact: true }).inputValue() === "", "Never invent typical episode runtime");
    await page.getByLabel("Minutes", { exact: true }).fill("24"); await page.getByLabel("Episode numbering", { exact: true }).selectOption("continuous"); await page.getByLabel("I confirm this is a typical episode duration").check(); await page.getByLabel("Funny", { exact: true }).check();
    await page.screenshot({ path: join(root, `review-${width}.png`), fullPage: true });
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "No horizontal overflow");
    await page.getByRole("button", { name: "Save title", exact: true }).press("Enter"); await page.waitForURL("**/watchlist/add?saved=*");
    check((await page.locator(".saved-summary").innerText()).includes("24 min"), "Real Kinopoisk save and typical runtime");
    await page.goto(origin + "/watchlist/add"); await page.getByLabel("Title", { exact: true }).fill(`Manual ${width}`); await page.getByLabel("Minutes", { exact: true }).fill("10"); await page.getByLabel("Funny", { exact: true }).check(); await page.getByRole("button", { name: "Save title", exact: true }).press("Enter"); await page.waitForURL("**/watchlist/add?saved=*");
    await page.getByRole("heading", { name: "Title saved", exact: true }).waitFor();
    report.push({ width, youtubeSaveReloadExpiryRefresh: true, kinopoiskAmbiguousReviewSave: true, manualFailurePreservation: true, keyboardSubmission: true, noHorizontalOverflow: true });
    await context.close();
  }
  phase = "privacy audit"; check(!secrets.some(secret => secret && logs.includes(secret)), "Routine logs must exclude fixture credentials");
  for (const file of [...files(join(repo, ".next")), path]) { const buffer = readFileSync(file); check(!secrets.some(secret => secret && buffer.includes(Buffer.from(secret))), "Generated artifacts/database must exclude raw fixture credentials"); }
  console.log(JSON.stringify({ pass: true, report, artifactRoot: process.env.WATCHNEXT_KEEP_BROWSER_ARTIFACTS === "1" ? root : undefined, privacyScan: true }));
} catch (error) { let message = error instanceof Error ? error.message : "Unknown fixture failure"; for (const secret of secrets) if (secret) message = message.split(secret).join("<redacted>"); message = message.replace(/\/invite\/[A-Za-z0-9_-]+/g, "/invite/<redacted>"); console.error(`Metadata browser verification failed during ${phase}: ${message.slice(0, 900)}`); if (process.env.WATCHNEXT_KEEP_BROWSER_ARTIFACTS === "1") console.log(JSON.stringify({ artifactRoot: root })); process.exitCode = 1; }
finally {
  db?.close(); await browser?.close();
  if (child && child.exitCode === null) { child.kill(); await new Promise(done => { child.once("exit", done); setTimeout(done, 5000).unref(); }); }
  if (process.env.WATCHNEXT_KEEP_BROWSER_ARTIFACTS !== "1") { if (dirname(resolve(root)) !== resolve(tmpdir()) || !basename(root).startsWith("watchnext-metadata-browser-")) throw new Error("Unsafe browser fixture cleanup"); rmSync(root, { recursive: true, force: true }); }
}
