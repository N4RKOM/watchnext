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
const root = mkdtempSync(join(tmpdir(), "watchnext-episode-browser-")), path = join(root, "browser.sqlite");
const secrets = [], report = []; let db, child, browser, logs = "", phase = "initialize";
const check = (ok, message) => { if (!ok) throw new Error(message); };
const net = createServer(); await new Promise(done => net.listen(0, "127.0.0.1", done)); const port = net.address().port; await new Promise(done => net.close(done));
const origin = `http://127.0.0.1:${port}`;
const files = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(join(directory, entry.name)) : [join(directory, entry.name)]);
const panel = page => page.getByRole("region", { name: "Your episode progress", exact: true });
async function choose(page, name) { await page.goto(origin + "/group"); await page.getByRole("button", { name: `${name} Select`, exact: true }).click(); await page.getByRole("button", { name: `${name} Active`, exact: true }).waitFor(); }
async function save(page, message = "Episode progress saved. Completion is unchanged.") { await panel(page).getByRole("button", { name: "Save episode progress", exact: true }).press("Enter"); await panel(page).getByText(message, { exact: true }).waitFor(); }
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
    const invite = createGroup(db, `Episode fixture ${width}`, origin).inviteUrl, group = db.prepare("SELECT id FROM groups WHERE name=?").get(`Episode fixture ${width}`).id;
    secrets.push(invite.split("/").at(-1)); const anna = randomUUID(), max = randomUUID(), series = randomUUID(), anime = randomUUID(), movie = randomUUID();
    for (const [id, name, color] of [[anna, "Anna", "#1d4ed8"], [max, "Max", "#0f766e"]]) db.prepare("INSERT INTO members(id,group_id,name,name_key,avatar_color) VALUES (?,?,?,?,?)").run(id, group, name, name.toLowerCase(), color);
    for (const [id, type, style] of [[series, "series", "season_episode"], [anime, "anime", "continuous"], [movie, "movie", "none"]]) db.prepare("INSERT INTO titles(id,group_id,title,title_key,content_type,duration_seconds,numbering_style) VALUES (?,?,?,?,?,1440,?)").run(id, group, `Fixture ${type}`, `fixture ${type}`, type, style);
    db.prepare("INSERT INTO contributors(group_id,title_id,member_id) VALUES (?,?,?)").run(group, series, anna);
    const contexts = await Promise.all([browser.newContext({ viewport: { width, height: 900 } }), browser.newContext({ viewport: { width, height: 900 } })]);
    for (const context of contexts) await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const [a, b] = await Promise.all(contexts.map(context => context.newPage()));
    for (const page of [a, b]) { await page.goto(invite); await page.waitForURL("**/group"); }
    for (const context of contexts) for (const cookie of await context.cookies()) if(cookie.name !== "watchnext_access_mode") secrets.push(cookie.value);
    await a.goto(`${origin}/watchlist/${series}`); await panel(a).getByRole("link", { name: "Choose profile" }).click(); await a.waitForURL("**/group"); await choose(a, "Anna"); await choose(b, "Max");
    await a.goto(`${origin}/watchlist/${series}`); check((await panel(a).innerText()).includes("Unknown / Not recorded"), "Absent must be Unknown"); check(db.prepare("SELECT count(*) n FROM progress WHERE group_id=?").get(group).n === 0, "Initial read must not create progress");
    phase = `browser ${width}: independent positions`;
    await panel(a).getByLabel("Episode position").selectOption("in_progress"); await panel(a).getByLabel("Next season to watch").fill("1"); await panel(a).getByLabel("Next episode to watch").fill("3"); await save(a); await a.reload();
    await b.goto(`${origin}/watchlist/${series}`); await panel(b).getByLabel("Episode position").selectOption("in_progress"); await panel(b).getByLabel("Next season to watch").fill("1"); await panel(b).getByLabel("Next episode to watch").fill("7"); await save(b); await a.reload();
    check(await panel(a).getByLabel("Next episode to watch").inputValue() === "3", "Anna own position"); check((await a.locator("article").filter({ has: a.getByRole("heading", { name: "Max", exact: true }) }).innerText()).includes("episode 7"), "Attributed Max history");
    phase = `browser ${width}: completion and transitions`;
    await panel(a).getByLabel("Next episode to watch").fill("99"); await panel(a).getByRole("button", { name: "Mark complete", exact: true }).press("Enter"); await panel(a).getByText("Marked complete. Your stored episode position is unchanged.", { exact: true }).waitFor(); check(await panel(a).getByLabel("Next episode to watch").inputValue() === "3", "Complete must retain stored coordinate");
    await panel(a).getByRole("button", { name: "Undo completion", exact: true }).press("Enter"); await panel(a).getByText("Completion undone. Your stored episode position is unchanged.", { exact: true }).waitFor();
    for (const [s, e] of [["1", "2"], ["1", "12"], ["2", "1"]]) { await panel(a).getByLabel("Next season to watch").fill(s); await panel(a).getByLabel("Next episode to watch").fill(e); await save(a); }
    phase = `browser ${width}: validation and rollback`;
    await panel(a).getByLabel("Next episode to watch").fill("1e2"); await panel(a).getByRole("button", { name: "Save episode progress", exact: true }).press("Enter"); await panel(a).getByText("Enter a whole number from 1 to 9999, using digits only.", { exact: true }).waitFor(); check(await panel(a).getByLabel("Next episode to watch").inputValue() === "1e2", "Validation preserves input");
    db.exec("CREATE TRIGGER browser_fail_episode BEFORE UPDATE ON progress BEGIN SELECT RAISE(ABORT,'synthetic failure'); END");
    await panel(a).getByLabel("Next episode to watch").fill("4"); await panel(a).getByRole("button", { name: "Save episode progress", exact: true }).press("Enter"); await panel(a).getByText("We couldn’t save episode progress. Your entered details are kept. Please try again.", { exact: true }).waitFor(); check(await panel(a).getByLabel("Next episode to watch").inputValue() === "4", "Storage retry preserves input"); check(db.prepare("SELECT next_episode FROM progress WHERE title_id=? AND member_id=?").get(series, anna).next_episode === 1, "Storage rollback"); db.exec("DROP TRIGGER browser_fail_episode"); await save(a);
    phase = `browser ${width}: stale profile and archive`;
    const switcher = await contexts[0].newPage(); await choose(switcher, "Max"); await panel(a).getByLabel("Next episode to watch").fill("9"); await panel(a).getByRole("button", { name: "Save episode progress", exact: true }).press("Enter"); await panel(a).getByRole("alert").waitFor(); check(db.prepare("SELECT next_episode FROM progress WHERE title_id=? AND member_id=?").get(series, max).next_episode === 7, "Stale form must not change switched member"); await a.reload(); check(await panel(a).getByLabel("Next episode to watch").inputValue() === "7", "Profile switch own projection");
    db.prepare("UPDATE titles SET archived=1 WHERE id=?").run(series); await panel(a).getByRole("button", { name: "Save episode progress", exact: true }).press("Enter"); await panel(a).getByRole("alert").waitFor(); check(db.prepare("SELECT archived FROM titles WHERE id=?").get(series).archived === 1, "No implicit restoration"); await a.reload(); check(await a.getByRole("button", { name: "Save episode progress", exact: true }).count() === 0, "Archived controls absent");
    phase = `browser ${width}: unavailable continuous metadata`;
    db.prepare("UPDATE titles SET provider_namespace='kinopoisk_unofficial',provider_id='1002' WHERE id=?").run(anime);
    for (const field of ["title", "contentType", "duration"]) db.prepare("INSERT INTO metadata_fields(title_id,field,origin,retrieved_at,expires_at) VALUES (?,?,'provider','2000-01-01','2000-01-02')").run(anime, field);
    await a.goto(`${origin}/watchlist/${anime}`); await a.getByRole("heading", { name: "Metadata unavailable", exact: true }).waitFor(); await panel(a).getByLabel("Episode position").selectOption("not_started"); await save(a); await a.reload(); check((await panel(a).innerText()).includes("Not started — episode 1"), "Explicit Not started persists");
    await panel(a).getByLabel("Episode position").selectOption("unknown"); await save(a); await a.reload(); check((await panel(a).innerText()).includes("Saved position: Unknown."), "Explicit Unknown persists");
    await panel(a).getByLabel("Episode position").selectOption("in_progress"); check(await panel(a).getByLabel("Next season to watch").count() === 0, "Continuous has no season"); await panel(a).getByLabel("Next episode to watch").fill("3"); await save(a); await a.reload(); check(await panel(a).getByLabel("Next episode to watch").inputValue() === "3", "Unavailable metadata position persists");
    check(await a.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "No horizontal overflow");
    check(await panel(a).locator(".progress-actions").evaluate(element => { const [first, second] = [...element.children].map(child => child.getBoundingClientRect()); return second.left >= first.right + 8 || second.top >= first.bottom + 8; }), "Actions have separated nonoverlapping targets");
    await panel(a).getByRole("button", { name: "Save episode progress", exact: true }).focus();
    check(await panel(a).getByRole("button", { name: "Save episode progress", exact: true }).evaluate(element => getComputedStyle(element).outlineStyle !== "none"), "Keyboard focus is visible");
    await a.screenshot({ path: join(root, `episode-${width}.png`), fullPage: true });
    await a.goto(`${origin}/watchlist/${movie}`); check(await a.getByRole("heading", { name: "Your episode progress", exact: true }).count() === 0, "Movie has no episodic controls");
    for (const context of contexts) await context.close(); report.push({ width, twoContextPositions: true, completionUndo: true, manualTransitions: true, validationRollbackRetry: true, staleProfileArchiveDenial: true, unavailableContinuousStates: true, keyboard: true, noOverflow: true });
  }
  phase = "privacy audit"; check(!secrets.some(secret => logs.includes(secret)), "No raw fixture credentials in routine output");
  for (const file of [...files(join(repo, ".next")), path]) { const buffer = readFileSync(file); check(!secrets.some(secret => buffer.includes(Buffer.from(secret))), "No raw fixture credentials in generated artifacts/database"); }
  console.log(JSON.stringify({ pass: true, report, privacyScan: true }));
  if (process.env.WATCHNEXT_BROWSER_INSPECT === "1") { console.log(JSON.stringify({ inspectionRoot: root })); await new Promise(done => setTimeout(done, 20000)); }
} catch (error) { let message = error instanceof Error ? error.message : "Unknown fixture failure"; for (const secret of secrets) message = message.split(secret).join("<redacted>"); message = message.replace(/\/invite\/[A-Za-z0-9_-]+/g, "/invite/<redacted>"); console.error(`Episode browser check failed during ${phase}: ${message.slice(0, 900)}`); process.exitCode = 1; }
finally {
  await browser?.close(); db?.close();
  if (child && child.exitCode === null) { child.kill(); await new Promise(done => { child.once("exit", done); setTimeout(done, 5000).unref(); }); }
  if (dirname(resolve(root)) !== resolve(tmpdir()) || !basename(root).startsWith("watchnext-episode-browser-")) throw new Error("Unsafe browser fixture cleanup"); rmSync(root, { recursive: true, force: true });
}
