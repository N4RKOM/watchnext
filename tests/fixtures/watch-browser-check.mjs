import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { randomUUID } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { initializeDatabase } from "../../db/connection.ts";
import { createGroup } from "../../lib/groups.ts";
const repo = fileURLToPath(new URL("../../", import.meta.url));
const root = mkdtempSync(join(tmpdir(), "watchnext-watch-browser-")), path = join(root, "browser.sqlite");
const secrets = [], report = []; let db, child, browser, logs = "", phase = "initialize";
const check = (ok, message) => { if (!ok) throw new Error(message); };
const net = createServer(); await new Promise(done => net.listen(0, "127.0.0.1", done)); const port = net.address().port; await new Promise(done => net.close(done));
const origin = `http://127.0.0.1:${port}`;
const files = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(join(directory, entry.name)) : [join(directory, entry.name)]);
const panel = page => page.getByRole("region", { name: "Your watch progress", exact: true });
async function choose(page, name) { await page.goto(origin + "/group"); await page.getByRole("button", { name: `${name} Select`, exact: true }).click(); await page.getByRole("button", { name: `${name} Active`, exact: true }).waitFor(); }
async function submit(page, button, message) {
  const path = new URL(page.url()).pathname, response = page.waitForResponse(response => response.request().method() === "POST" && new URL(response.url()).pathname === path);
  await panel(page).getByRole("button", { name: button, exact: true }).press("Enter"); await response; await panel(page).getByText(message, { exact: true }).waitFor();
}
const save = page => submit(page, "Save timestamp", "Timestamp saved. Completion is unchanged.");
try {
  check(Boolean(process.env.WATCHNEXT_BROWSER_MODULE && process.env.WATCHNEXT_BROWSER_EXECUTABLE), "Explicit installed browser runtime required");
  initializeDatabase({ WATCHNEXT_DATABASE_PATH: path }); db = new DatabaseSync(path); db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;");
  const runtime = await import(pathToFileURL(process.env.WATCHNEXT_BROWSER_MODULE).href), chromium = runtime.chromium ?? runtime.default?.chromium;
  child = spawn(process.execPath, ["--import", pathToFileURL(join(repo, "scripts/framework-privacy.mjs")).href, join(repo, "node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", String(port)], { cwd: repo, windowsHide: true, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, WATCHNEXT_DATABASE_PATH: path, WATCHNEXT_APP_ORIGIN: origin, YOUTUBE_API_KEY: "", KINOPOISK_UNOFFICIAL_API_KEY: "", NEXT_TELEMETRY_DISABLED: "1" } });
  child.stdout.on("data", data => { logs += data; }); child.stderr.on("data", data => { logs += data; });
  let ready = false; for (let tries = 0; tries < 100; tries++) { try { if ((await fetch(origin)).ok) { ready = true; break; } } catch {} if (child.exitCode !== null) break; await new Promise(done => setTimeout(done, 100)); }
  if (!ready) throw new Error(`Isolated server failed to start: ${logs}`);
  browser = await chromium.launch({ executablePath: process.env.WATCHNEXT_BROWSER_EXECUTABLE, headless: true, args: ["--disable-background-networking", "--no-first-run"] });
  for (const width of [375, 1280]) {
    phase = `browser ${width}: fixture`;
    const invite = createGroup(db, `Watch fixture ${width}`, origin).inviteUrl, group = db.prepare("SELECT id FROM groups WHERE name=?").get(`Watch fixture ${width}`).id;
    secrets.push(invite.split("/").at(-1)); const anna = randomUUID(), max = randomUUID(), movie = randomUUID(), video = randomUUID(), series = randomUUID();
    for (const [id, name, color] of [[anna, "Anna", "#1d4ed8"], [max, "Max", "#0f766e"]]) db.prepare("INSERT INTO members(id,group_id,name,name_key,avatar_color) VALUES (?,?,?,?,?)").run(id, group, name, name.toLowerCase(), color);
    for (const [id, type, style, seconds] of [[movie, "movie", "none", 5400], [video, "youtube", "none", 120], [series, "series", "season_episode", 1440]]) db.prepare("INSERT INTO titles(id,group_id,title,title_key,content_type,duration_seconds,numbering_style) VALUES (?,?,?,?,?,?,?)").run(id, group, `Fixture ${type}`, `fixture ${type}`, type, seconds, style);
    db.prepare("INSERT INTO contributors(group_id,title_id,member_id) VALUES (?,?,?)").run(group, movie, anna);
    const contexts = await Promise.all([browser.newContext({ viewport: { width, height: 900 } }), browser.newContext({ viewport: { width, height: 900 } })]);
    for (const context of contexts) await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const [a, b] = await Promise.all(contexts.map(context => context.newPage()));
    for (const page of [a, b]) { await page.goto(invite); await page.waitForURL("**/group"); }
    for (const context of contexts) for (const cookie of await context.cookies()) secrets.push(cookie.value);
    await a.goto(`${origin}/watchlist/${movie}`); await panel(a).getByRole("link", { name: "Choose profile" }).click(); await a.waitForURL("**/group"); await choose(a, "Anna"); await choose(b, "Max");
    await a.goto(`${origin}/watchlist/${movie}`); check(await panel(a).getByLabel("Stopped at").inputValue() === "", "Absent is not a fabricated zero"); check(db.prepare("SELECT count(*) n FROM progress WHERE group_id=?").get(group).n === 0, "Read must not insert progress");
    phase = `browser ${width}: zero, clear and independent histories`;
    await panel(a).getByLabel("Stopped at").fill("0:00"); await save(a); check(db.prepare("SELECT timestamp_seconds FROM progress WHERE title_id=? AND member_id=?").get(movie, anna).timestamp_seconds === 0, "Saved zero is distinct from NULL");
    await panel(a).getByLabel("Stopped at").fill(""); await submit(a, "Save timestamp", "Timestamp cleared. Completion is unchanged."); check(db.prepare("SELECT timestamp_seconds FROM progress WHERE title_id=? AND member_id=?").get(movie, anna).timestamp_seconds === null, "Blank really clears");
    await panel(a).getByLabel("Stopped at").fill("1:10:00"); await save(a); await a.reload(); check(await panel(a).getByLabel("Stopped at").inputValue() === "1:10:00", "Own timestamp reload"); check(db.prepare("SELECT duration_seconds FROM titles WHERE id=?").get(movie).duration_seconds === 5400, "Full duration stays 5400");
    await b.goto(`${origin}/watchlist/${movie}`); await panel(b).getByLabel("Stopped at").fill("12:05"); await save(b); await panel(b).getByLabel("Stopped at").fill("invalid unsaved text"); await submit(b, "Mark complete", "Marked complete. Your stored timestamp is unchanged."); check(await panel(b).getByLabel("Stopped at").inputValue() === "12:05", "Completion ignores unsaved text");
    await a.reload(); check((await a.getByRole("article", { name: "Max", exact: true }).innerText()).includes("Manual timestamp: 12:05"), "Attributed Max history"); check(await panel(a).getByLabel("Stopped at").inputValue() === "1:10:00", "Anna stays independent");
    phase = `browser ${width}: bounds and retry`;
    await panel(a).getByLabel("Stopped at").fill("1:30:00"); await save(a); check(db.prepare("SELECT completed FROM progress WHERE title_id=? AND member_id=?").get(movie, anna).completed === 0, "Ending does not complete automatically");
    await panel(a).getByLabel("Stopped at").fill("1:99:00"); await submit(a, "Save timestamp", "Check Stopped at. Nothing was changed."); check(await panel(a).getByLabel("Stopped at").inputValue() === "1:99:00", "Invalid input preserved");
    db.exec("CREATE TRIGGER browser_fail_watch BEFORE UPDATE ON progress BEGIN SELECT RAISE(ABORT,'synthetic failure'); END");
    await panel(a).getByLabel("Stopped at").fill("12:00"); await submit(a, "Save timestamp", "We couldn’t save watch progress. Your entered timestamp is kept. Please try again."); check(await panel(a).getByLabel("Stopped at").inputValue() === "12:00", "Storage retry input preserved"); check(db.prepare("SELECT timestamp_seconds FROM progress WHERE title_id=? AND member_id=?").get(movie, anna).timestamp_seconds === 5400, "Storage rollback"); db.exec("DROP TRIGGER browser_fail_watch"); await save(a);
    await panel(a).getByLabel("Stopped at").fill("1:10:00"); await save(a);
    phase = `browser ${width}: corrected duration and legacy completion`;
    db.prepare("UPDATE titles SET duration_seconds=3600 WHERE id=?").run(movie); await a.reload(); await panel(a).getByText("Your saved timestamp is beyond the current full duration. It is preserved; correct or clear it when ready.", { exact: true }).waitFor();
    await submit(a, "Mark complete", "Marked complete. Your stored timestamp is unchanged."); await submit(a, "Undo completion", "Completion undone. Your stored timestamp is unchanged."); check(await panel(a).getByLabel("Stopped at").inputValue() === "1:10:00", "Oversized legacy completion preserves timestamp");
    await submit(a, "Save timestamp", "Check Stopped at. Nothing was changed."); await panel(a).getByText("Stopped at must not exceed the current full duration.", { exact: true }).waitFor(); await panel(a).getByLabel("Stopped at").fill("59:59"); await save(a);
    phase = `browser ${width}: stale profile/archive`;
    const switcher = await contexts[0].newPage(); await choose(switcher, "Max"); await panel(a).getByLabel("Stopped at").fill("1:00"); await submit(a, "Save timestamp", "Watch progress is unavailable for this profile or title. Reload, choose your profile, and restore archived titles before updating."); check(db.prepare("SELECT timestamp_seconds FROM progress WHERE title_id=? AND member_id=?").get(movie, max).timestamp_seconds === 725, "Stale profile cannot alter Max"); await a.reload(); check(await panel(a).getByLabel("Stopped at").inputValue() === "12:05", "Switched own projection");
    db.prepare("UPDATE titles SET archived=1 WHERE id=?").run(movie); await submit(a, "Clear timestamp", "Watch progress is unavailable for this profile or title. Reload, choose your profile, and restore archived titles before updating."); check(db.prepare("SELECT archived FROM titles WHERE id=?").get(movie).archived === 1, "No automatic restore"); await a.reload(); check(await a.getByRole("heading", { name: "Your watch progress", exact: true }).count() === 0, "Archived timestamp panel absent");
    phase = `browser ${width}: nullable runtime`;
    await a.goto(`${origin}/watchlist/${video}`); await panel(a).getByLabel("Stopped at").fill("1:30"); await save(a);
    db.prepare("UPDATE titles SET provider_namespace='youtube',provider_id='YtFixture01' WHERE id=?").run(video);
    for (const field of ["title", "contentType", "duration"]) db.prepare("INSERT INTO metadata_fields(title_id,field,origin,retrieved_at,expires_at) VALUES (?,?,'provider','2000-01-01','2000-01-02')").run(video, field);
    await a.reload(); await a.getByRole("heading", { name: "Metadata unavailable", exact: true }).waitFor(); check(await panel(a).getByLabel("Stopped at").inputValue() === "1:30", "Expiry keeps position"); check(await panel(a).getByLabel("Stopped at").evaluate(element => element.readOnly), "Unknown runtime disallows new text"); check(await panel(a).getByRole("button", { name: "Save timestamp", exact: true }).isDisabled(), "Unknown runtime cannot save new timestamp");
    await submit(a, "Mark complete", "Marked complete. Your stored timestamp is unchanged."); await submit(a, "Undo completion", "Completion undone. Your stored timestamp is unchanged."); await submit(a, "Clear timestamp", "Timestamp cleared. Completion is unchanged."); check(db.prepare("SELECT timestamp_seconds FROM progress WHERE title_id=? AND member_id=?").get(video, max).timestamp_seconds === null, "Clear works without runtime");
    check(await a.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "No horizontal overflow"); await panel(a).getByRole("button", { name: "Clear timestamp", exact: true }).focus(); check(await panel(a).getByRole("button", { name: "Clear timestamp", exact: true }).evaluate(element => getComputedStyle(element).outlineStyle !== "none"), "Visible keyboard focus");
    check(await panel(a).locator(".progress-actions").evaluate(element => { const boxes = [...element.children].map(child => child.getBoundingClientRect()); return boxes.every((box, i) => i === 0 || box.left >= boxes[i - 1].right + 8 || box.top >= boxes[i - 1].bottom + 8); }), "Nonoverlapping spaced action targets");
    await a.screenshot({ path: join(root, `watch-${width}.png`), fullPage: true }); await a.goto(`${origin}/watchlist/${series}`); check(await a.getByRole("heading", { name: "Your watch progress", exact: true }).count() === 0, "No episode timestamp controls"); await a.getByRole("heading", { name: "Your episode progress", exact: true }).waitFor();
    for (const context of contexts) await context.close(); report.push({ width, twoContextTimestamps: true, zeroNullBounds: true, completionLegacyDuration: true, validationRollbackRetry: true, staleProfileArchiveDenial: true, nullableRuntimeClearCompletion: true, keyboardFocus: true, noOverflowOverlap: true });
  }
  phase = "privacy audit"; check(!secrets.some(secret => logs.includes(secret)), "No raw fixture credentials in routine output"); for (const file of [...files(join(repo, ".next")), path]) { const buffer = readFileSync(file); check(!secrets.some(secret => buffer.includes(Buffer.from(secret))), "No raw fixture credentials in generated artifacts/database"); }
  console.log(JSON.stringify({ pass: true, report, privacyScan: true }));
  if (process.env.WATCHNEXT_BROWSER_INSPECT === "1") { console.log(JSON.stringify({ inspectionRoot: root })); await new Promise(done => setTimeout(done, 20000)); }
} catch (error) { let message = error instanceof Error ? error.message : "Unknown fixture failure"; for (const secret of secrets) message = message.split(secret).join("<redacted>"); message = message.replace(/\/invite\/[A-Za-z0-9_-]+/g, "/invite/<redacted>"); console.error(`Watch browser check failed during ${phase}: ${message.slice(0, 900)}`); process.exitCode = 1; }
finally {
  await browser?.close(); db?.close(); if (child && child.exitCode === null) { child.kill(); await new Promise(done => { child.once("exit", done); setTimeout(done, 5000).unref(); }); }
  if (dirname(resolve(root)) !== resolve(tmpdir()) || !basename(root).startsWith("watchnext-watch-browser-")) throw new Error("Unsafe fixture cleanup"); rmSync(root, { recursive: true, force: true });
}
