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
const root = mkdtempSync(join(tmpdir(), "watchnext-rating-browser-")), path = join(root, "browser.sqlite");
const secrets = [], report = []; let db, child, browser, logs = "", phase = "initialize";
const check = (ok, message) => { if (!ok) throw new Error(message); };
const net = createServer(); await new Promise(done => net.listen(0, "127.0.0.1", done)); const port = net.address().port; await new Promise(done => net.close(done));
const origin = `http://127.0.0.1:${port}`;
const files = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(join(directory, entry.name)) : [join(directory, entry.name)]);
const panel = page => page.getByRole("region", { name: "Your rating", exact: true });
async function choose(page, name) { await page.goto(origin + "/group"); await page.getByRole("button", { name: `${name} Select`, exact: true }).click(); await page.getByRole("button", { name: `${name} Active`, exact: true }).waitFor(); }
async function submit(page, button = "Save rating", message = "Your whole-title rating is saved.") {
  const path = new URL(page.url()).pathname, response = page.waitForResponse(response => response.request().method() === "POST" && new URL(response.url()).pathname === path);
  await panel(page).getByRole("button", { name: button, exact: true }).press("Enter"); await response; await panel(page).getByText(message, { exact: true }).waitFor();
}
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
    const invite = createGroup(db, `Rating fixture ${width}`, origin).inviteUrl, group = db.prepare("SELECT id FROM groups WHERE name=?").get(`Rating fixture ${width}`).id;
    secrets.push(invite.split("/").at(-1)); const anna = randomUUID(), max = randomUUID(), movie = randomUUID(), video = randomUUID(), series = randomUUID(), anime = randomUUID();
    for (const [id, name, color] of [[anna, "Anna", "#1d4ed8"], [max, "Max", "#0f766e"]]) db.prepare("INSERT INTO members(id,group_id,name,name_key,avatar_color) VALUES (?,?,?,?,?)").run(id, group, name, name.toLowerCase(), color);
    for (const [id, type, style] of [[movie, "movie", "none"], [video, "youtube", "none"], [series, "series", "season_episode"], [anime, "anime", "continuous"]]) db.prepare("INSERT INTO titles(id,group_id,title,title_key,content_type,duration_seconds,numbering_style) VALUES (?,?,?,?,?,5400,?)").run(id, group, `Fixture ${type}`, `fixture ${type}`, type, style);
    db.prepare("INSERT INTO contributors(group_id,title_id,member_id) VALUES (?,?,?)").run(group, movie, anna);
    db.prepare("INSERT INTO notes(group_id,title_id,member_id,body) VALUES (?,?,?,'Independent note')").run(group, movie, anna);
    const contexts = await Promise.all([browser.newContext({ viewport: { width, height: 900 } }), browser.newContext({ viewport: { width, height: 900 } }), browser.newContext({ viewport: { width, height: 900 } })]);
    for (const context of contexts) await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const [a, b, viewer] = await Promise.all(contexts.map(context => context.newPage()));
    for (const page of [a, b, viewer]) { await page.goto(invite); await page.waitForURL("**/group"); }
    for (const context of contexts) for (const cookie of await context.cookies()) if(cookie.name !== "watchnext_access_mode") secrets.push(cookie.value);
    await a.goto(`${origin}/watchlist/${movie}`); await panel(a).getByRole("link", { name: "Choose profile" }).click(); await a.waitForURL("**/group"); await choose(a, "Anna"); await choose(b, "Max");
    await a.goto(`${origin}/watchlist/${movie}`); check((await panel(a).innerText()).includes("Your saved rating: Not rated."), "Absence is Not rated");
    phase = `browser ${width}: bounds and attribution`;
    for (const score of ["1", "10", "5"]) { await panel(a).getByLabel("Rating (1–10)").fill(score); await submit(a); await a.reload(); check(await panel(a).getByLabel("Rating (1–10)").inputValue() === score, "Saved rating reload"); }
    check(db.prepare("SELECT count(*) n FROM progress WHERE group_id=?").get(group).n === 0, "Rating does not require or invent completion/progress");
    await b.goto(`${origin}/watchlist/${movie}`); await panel(b).getByLabel("Rating (1–10)").fill("3"); await submit(b); await panel(a).getByLabel("Rating (1–10)").fill("8"); await submit(a);
    await viewer.goto(`${origin}/watchlist/${movie}`); await panel(viewer).getByRole("link", { name: "Choose profile" }).waitFor(); check((await viewer.getByRole("article", { name: "Anna", exact: true }).innerText()).includes("Rating: 8/10"), "Group-visible Anna rating"); check((await viewer.getByRole("article", { name: "Max", exact: true }).innerText()).includes("Rating: 3/10"), "Group-visible Max rating");
    phase = `browser ${width}: validation clear and idempotence`;
    for (const value of ["7.5", ""]) { await panel(a).getByLabel("Rating (1–10)").fill(value); await submit(a, "Save rating", "Check your rating. Nothing was changed."); check(await panel(a).getByLabel("Rating (1–10)").inputValue() === value, "Validation keeps entered input"); check(db.prepare("SELECT score FROM ratings WHERE title_id=? AND member_id=?").get(movie, anna).score === 8, "Invalid/blank save cannot clear"); }
    await submit(a, "Clear my rating", "Your rating is cleared. Not rated."); await submit(a, "Clear my rating", "Your rating is cleared. Not rated."); check(db.prepare("SELECT count(*) n FROM ratings WHERE title_id=? AND member_id=?").get(movie, anna).n === 0, "Clear deletes only own row"); check(db.prepare("SELECT score FROM ratings WHERE title_id=? AND member_id=?").get(movie, max).score === 3, "Max is unchanged by Anna clear");
    phase = `browser ${width}: insert update delete rollback`;
    for (const operation of ["INSERT", "UPDATE", "DELETE"]) {
      db.exec(`CREATE TRIGGER browser_fail_rating BEFORE ${operation} ON ratings BEGIN SELECT RAISE(ABORT,'synthetic failure'); END`);
      await panel(a).getByLabel("Rating (1–10)").fill(operation === "INSERT" ? "8" : "9"); const before = db.prepare("SELECT score FROM ratings WHERE title_id=? AND member_id=?").get(movie, anna)?.score ?? null;
      await submit(a, operation === "DELETE" ? "Clear my rating" : "Save rating", "We couldn’t save your rating. Your entered score is kept. Please try again."); check(await panel(a).getByLabel("Rating (1–10)").inputValue() === (operation === "INSERT" ? "8" : "9"), "Storage retry keeps input"); check((db.prepare("SELECT score FROM ratings WHERE title_id=? AND member_id=?").get(movie, anna)?.score ?? null) === before, "Failed rating operation rolls back"); db.exec("DROP TRIGGER browser_fail_rating"); await submit(a);
    }
    await submit(a); check(db.prepare("SELECT count(*) n FROM ratings WHERE title_id=? AND member_id=?").get(movie, anna).n === 1, "Repeated save has one row");
    phase = `browser ${width}: progress and nullable metadata`;
    const watch = a.getByRole("region", { name: "Your watch progress", exact: true }); await watch.getByLabel("Stopped at").fill("1:00"); await watch.getByRole("button", { name: "Save timestamp", exact: true }).press("Enter"); await watch.getByText("Timestamp saved. Completion is unchanged.", { exact: true }).waitFor();
    db.prepare("UPDATE titles SET provider_namespace='youtube',provider_id='YtFixture01' WHERE id=?").run(movie); for (const field of ["title", "contentType", "duration"]) db.prepare("INSERT INTO metadata_fields(title_id,field,origin,retrieved_at,expires_at) VALUES (?,?,'provider','2000-01-01','2000-01-02')").run(movie, field);
    await a.reload(); await a.getByRole("heading", { name: "Metadata unavailable", exact: true }).waitFor(); await panel(a).getByLabel("Rating (1–10)").fill("9"); await submit(a); check(db.prepare("SELECT timestamp_seconds,completed FROM progress WHERE title_id=? AND member_id=?").get(movie, anna).timestamp_seconds === 60, "Rating preserves timestamp after expiry"); check(db.prepare("SELECT duration_seconds FROM titles WHERE id=?").get(movie).duration_seconds === null, "No reconstructed runtime");
    phase = `browser ${width}: actual archive restore and stale form`;
    const removal = await contexts[0].newPage(); await removal.goto(`${origin}/watchlist/${movie}`); await removal.getByRole("button", { name: "Remove my contribution", exact: true }).click(); await removal.getByRole("button", { name: "Confirm removal", exact: true }).press("Enter"); await removal.getByRole("button", { name: "Restore to watchlist", exact: true }).waitFor();
    await submit(a, "Save rating", "Your rating is unavailable for this profile or title. Reload, choose your profile, and restore archived titles before updating."); await a.reload(); check(await a.getByRole("heading", { name: "Your rating", exact: true }).count() === 0, "Archived rating panel absent"); check((await a.getByRole("article", { name: "Anna", exact: true }).innerText()).includes("Rating: 9/10"), "Archived score retained");
    await a.getByRole("button", { name: "Restore to watchlist", exact: true }).press("Enter"); await panel(a).getByLabel("Rating (1–10)").waitFor(); check(await panel(a).getByLabel("Rating (1–10)").inputValue() === "9", "Real restore keeps rating"); check(db.prepare("SELECT body FROM notes WHERE title_id=? AND member_id=?").get(movie, anna).body === "Independent note", "Notes survive rating/archive roundtrip");
    await choose(removal, "Max"); await panel(a).getByLabel("Rating (1–10)").fill("2"); await submit(a, "Save rating", "Your rating is unavailable for this profile or title. Reload, choose your profile, and restore archived titles before updating."); check(db.prepare("SELECT score FROM ratings WHERE title_id=? AND member_id=?").get(movie, max).score === 3, "Stale profile cannot edit Max"); await a.reload(); check(await panel(a).getByLabel("Rating (1–10)").inputValue() === "3", "Own switched profile reload");
    phase = `browser ${width}: all types and episode panel`;
    for (const id of [video, series, anime]) { await a.goto(`${origin}/watchlist/${id}`); await panel(a).getByLabel("Rating (1–10)").fill("7"); await submit(a); }
    const episode = a.getByRole("region", { name: "Your episode progress", exact: true }); await episode.getByLabel("Episode position").selectOption("in_progress"); await episode.getByLabel("Next episode to watch").fill("7"); await episode.getByRole("button", { name: "Save episode progress", exact: true }).press("Enter"); await episode.getByText("Episode progress saved. Completion is unchanged.", { exact: true }).waitFor(); check(db.prepare("SELECT score FROM ratings WHERE title_id=? AND member_id=?").get(anime, max).score === 7, "Episode update keeps rating");
    check(await a.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "No horizontal overflow"); await panel(a).getByRole("button", { name: "Save rating", exact: true }).focus(); check(await panel(a).getByRole("button", { name: "Save rating", exact: true }).evaluate(element => getComputedStyle(element).outlineStyle !== "none"), "Visible keyboard focus");
    check(await panel(a).locator(".progress-actions").evaluate(element => { const [first, second] = [...element.children].map(child => child.getBoundingClientRect()); return second.left >= first.right + 8 || second.top >= first.bottom + 8; }), "Separated nonoverlapping targets"); await panel(a).screenshot({ path: join(root, `rating-${width}.png`) });
    for (const context of contexts) await context.close(); report.push({ width, twoMemberRatings: true, wholeTitleAllTypes: true, unselectedViewerAttribution: true, clearIdempotence: true, validationRollbackRetry: true, actualArchiveRestoreStaleDenial: true, progressExpiryPreservation: true, keyboardFocusNoOverflow: true });
  }
  phase = "privacy audit"; check(!secrets.some(secret => logs.includes(secret)), "No raw fixture credentials in routine output"); for (const file of [...files(join(repo, ".next")), path]) { const buffer = readFileSync(file); check(!secrets.some(secret => buffer.includes(Buffer.from(secret))), "No raw fixture credentials in artifacts/database"); }
  console.log(JSON.stringify({ pass: true, report, privacyScan: true })); if (process.env.WATCHNEXT_BROWSER_INSPECT === "1") { console.log(JSON.stringify({ inspectionRoot: root })); await new Promise(done => setTimeout(done, 20000)); }
} catch (error) { let message = error instanceof Error ? error.message : "Unknown fixture failure"; for (const secret of secrets) message = message.split(secret).join("<redacted>"); message = message.replace(/\/invite\/[A-Za-z0-9_-]+/g, "/invite/<redacted>"); console.error(`Rating browser check failed during ${phase}: ${message.slice(0, 900)}`); process.exitCode = 1; }
finally {
  await browser?.close(); db?.close(); if (child && child.exitCode === null) { child.kill(); await new Promise(done => { child.once("exit", done); setTimeout(done, 5000).unref(); }); }
  if (dirname(resolve(root)) !== resolve(tmpdir()) || !basename(root).startsWith("watchnext-rating-browser-")) throw new Error("Unsafe fixture cleanup"); rmSync(root, { recursive: true, force: true });
}
