import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtempSync, realpathSync, lstatSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir, platform } from "node:os";
import { join, dirname, basename, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { stopOwned } from "./guide-process.mjs";
const repo = fileURLToPath(new URL("../../", import.meta.url));
let root, neighbor, browser, server, building, output = "", phase = "owned setup", failure, cleaned = false;
const check = (value, label) => { if (!value) throw Error(`Expected ${label}; observed false`); };
const step = async (name, action) => { phase = name; await action(); console.log(`PASS ${name}`); };
function owned(path, prefix) {
  if (dirname(resolve(path)) !== realpathSync.native(tmpdir()) || !new RegExp(`^${prefix}[A-Za-z0-9]+$`).test(basename(path)) || lstatSync(path).isSymbolicLink() || realpathSync.native(path) !== resolve(path)) throw Error("Refusing cleanup outside owned mock fixture");
}
const sentinel = "Unrelated synthetic storage sentinel";
function unchanged() { for (const name of ["normal.sqlite", "demo.sqlite", "unrelated.txt"]) check(readFileSync(join(neighbor, name), "utf8") === sentinel, "neighbor sentinels unchanged"); }
async function cleanup() {
  if (cleaned) return; cleaned = true; const errors = [];
  for (const action of [() => browser?.close(), () => stopOwned(server), () => stopOwned(building)]) try { await action(); } catch (error) { errors.push(error); }
  try { if (root) { check(!existsSync(join(root, "must-stay-absent.sqlite")), "mock never creates initialized storage"); check(!existsSync(join(root, "normal-default")), "no fallback normal storage"); } if (neighbor) unchanged(); } catch (error) { errors.push(error); }
  if (root) { owned(root, "watchnext-mock-"); rmSync(root, { recursive: true, force: true }); }
  if (neighbor) { unchanged(); owned(neighbor, "watchnext-mock-sentinels-"); rmSync(neighbor, { recursive: true, force: true }); }
  if (errors.length) throw errors[0];
}
const interrupted = () => { void cleanup().then(() => process.exit(1), () => process.exit(1)); };
process.once("SIGINT", interrupted); process.once("SIGTERM", interrupted);
try {
  root = mkdtempSync(join(realpathSync.native(tmpdir()), "watchnext-mock-")); neighbor = mkdtempSync(join(realpathSync.native(tmpdir()), "watchnext-mock-sentinels-"));
  owned(root, "watchnext-mock-"); owned(neighbor, "watchnext-mock-sentinels-");
  for (const name of ["normal.sqlite", "demo.sqlite", "unrelated.txt"]) writeFileSync(join(neighbor, name), sentinel);
  const socket = createServer(); await new Promise(done => socket.listen(0, "127.0.0.1", done)); const port = socket.address().port; await new Promise(done => socket.close(done));
  const origin = `http://127.0.0.1:${port}`;
  const env = { ...process.env, HOME: join(root, "fake-home"), USERPROFILE: join(root, "fake-home"), LOCALAPPDATA: join(root, "normal-default"), XDG_DATA_HOME: join(root, "normal-default"), WATCHNEXT_DATABASE_PATH: join(root, "must-stay-absent.sqlite"), WATCHNEXT_APP_ORIGIN: origin, YOUTUBE_API_KEY: "", KINOPOISK_UNOFFICIAL_API_KEY: "", NEXT_TELEMETRY_DISABLED: "1" };
  const startChild = args => { const child = spawn(process.execPath, args, { cwd: repo, env, windowsHide: true, detached: platform() !== "win32", stdio: ["ignore", "pipe", "pipe"] }); child.stdout.on("data", data => output += data); child.stderr.on("data", data => output += data); child.on("error", () => {}); return child; };
  await step("current source production build without database initialization", async () => {
    building = startChild([join(repo, "node_modules/next/dist/bin/next"), "build"]); let timer;
    try { await new Promise((done, fail) => { timer = setTimeout(() => { void stopOwned(building).then(() => fail(Error("Build exceeded five minutes")), fail); }, 300000); building.once("error", fail); building.once("exit", code => code === 0 ? done() : fail(Error("Build failed; run pnpm build for compiler diagnostics"))); }); } finally { clearTimeout(timer); }
  });
  await step("owned production server and pinned browser", async () => {
    if (!existsSync(chromium.executablePath())) throw Error("Install matching Chromium with pnpm exec playwright install chromium");
    server = startChild(["--import", pathToFileURL(join(repo, "scripts/framework-privacy.mjs")).href, join(repo, "node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", String(port)]);
    const deadline = Date.now() + 30000; let ready = false;
    while (Date.now() < deadline) { if (server.exitCode !== null) throw Error("Owned server exited before readiness"); try { if ((await fetch(origin + "/mock", { signal: AbortSignal.timeout(1000) })).ok) { ready = true; break; } } catch {} await new Promise(done => setTimeout(done, 100)); }
    check(ready, "owned server ready before deadline"); browser = await chromium.launch({ headless: true, args: ["--disable-background-networking"] });
  });
  const screenshots = [];
  for (const width of [375, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: "block" }); context.setDefaultTimeout(10000);
    let mockPhase = true; const unexpected = [], external = [];
    await context.route("**/*", route => { const url = new URL(route.request().url()); if (url.origin !== origin) { external.push(url.hostname); return route.abort(); } return route.continue(); });
    context.on("request", request => { const url = new URL(request.url()); if (mockPhase && (!(["/mock", "/favicon.ico"].includes(url.pathname) || url.pathname.startsWith("/_next/")) || request.method() !== "GET")) unexpected.push(url.pathname); });
    const page = await context.newPage();
    await step(`${width}: explicit shell, real service pending/failure/retry/cancel/reset and tab isolation`, async () => {
      await page.goto(origin + "/mock?memberId=forged&scenario=slow"); await page.getByRole("heading", { name: "WatchNext preview", exact: true }).waitFor();
      await page.getByLabel("Synthetic demo notice").waitFor(); check(await page.getByText("Not available yet", { exact: true }).count() === 6, "six pending domains, no pretend working forms");
      await page.keyboard.press("Tab"); check((await page.locator(":focus").textContent()) === "Skip to main content", "keyboard skip link"); await page.keyboard.press("Enter");
      await page.getByRole("button", { name: "Load preview", exact: true }).press("Enter"); await page.getByRole("status").filter({ hasText: "Loading" }).waitFor();
      await page.getByRole("button", { name: "Cancel request", exact: true }).press("Enter"); await page.getByRole("status").filter({ hasText: "canceled" }).waitFor();
      await page.getByLabel("Simulated response").selectOption("unavailable"); await page.getByRole("button", { name: "Load preview", exact: true }).press("Enter"); await page.getByRole("alert").filter({ hasText: "Choose Ready and retry" }).waitFor();
      await page.getByLabel("Simulated response").selectOption("ready"); await page.getByRole("button", { name: "Load preview", exact: true }).press("Enter"); await page.getByText("Demo revision: 0", { exact: true }).waitFor();
      await page.getByRole("button", { name: "Reset demo", exact: true }).press("Enter"); await page.getByText("Demo revision: 1", { exact: true }).waitFor();
      const second = await context.newPage(); await second.goto(origin + "/mock"); await second.getByRole("button", { name: "Load preview", exact: true }).press("Enter"); await second.getByText("Demo revision: 0", { exact: true }).waitFor(); await second.close();
      await page.getByText("Demo revision: 1", { exact: true }).waitFor(); check(await page.evaluate(() => localStorage.length === 0 && sessionStorage.length === 0), "no persisted mock state"); check((await context.cookies()).length === 0, "no auth or mode cookies");
      check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "no horizontal overflow");
      if (process.env.WATCHNEXT_VISUAL_CHECK === "1") { const path = join(root, `mock-${width}.png`); await page.screenshot({ path, fullPage: true }); screenshots.push(path); }
      await page.reload(); await page.getByRole("button", { name: "Load preview", exact: true }).press("Enter"); await page.getByText("Demo revision: 0", { exact: true }).waitFor();
      await page.goto(origin + "/mock?mode=http&scenario=ready"); await page.getByRole("alert").filter({ hasText: "Unsupported preview selection" }).waitFor(); check(await page.getByRole("button").count() === 0, "invalid mode has no working demo controls"); await page.getByLabel("Synthetic demo notice").waitFor();
      await page.goto(origin + "/mock?scenario=slow&scenario=ready"); await page.getByRole("alert").filter({ hasText: "Unsupported preview selection" }).waitFor();
      check(unexpected.length === 0 && external.length === 0, "mock makes no production action/provider or external request"); check(!existsSync(env.WATCHNEXT_DATABASE_PATH), "uninitialized configured DB stays absent"); unchanged();
    });
    mockPhase = false;
    await step(`${width}: production default and forged query stay production, without initialization`, async () => {
      await page.goto(origin); await page.getByRole("heading", { name: "Your private account", exact: true }).waitFor(); const home = await page.locator("main").innerText();
      await page.goto(origin + "/?mode=mock&scenario=unavailable&memberId=forged"); await page.getByRole("heading", { name: "Your private account", exact: true }).waitFor(); check(await page.locator("main").innerText() === home, "production home unchanged by mock/persona query"); check(await page.getByLabel("Synthetic demo notice").count() === 0, "production query cannot enable mock mode");
      // Uninitialized production storage must keep its existing honest load error, not mock data.
      await page.goto(origin + "/watchlist"); await page.getByRole("heading", { name: "Couldn’t load your watchlist", exact: true }).waitFor(); const library = await page.locator("main").innerText();
      await page.goto(origin + "/watchlist?mode=mock&memberId=forged"); await page.getByRole("heading", { name: "Couldn’t load your watchlist", exact: true }).waitFor(); check(await page.locator("main").innerText() === library, "production storage/access path unchanged by forged query"); check(await page.getByLabel("Synthetic demo notice").count() === 0, "production never silently falls back to demo"); unchanged();
    });
    await context.close();
  }
  if (screenshots.length) { console.log(`VISUAL ${root}`); await new Promise(done => setTimeout(done, 30000)); }
  check(!output.includes("YOUTUBE_API_KEY=") && !output.includes("KINOPOISK_UNOFFICIAL_API_KEY="), "no credential diagnostics");
} catch (error) { failure = error; }
finally { try { await cleanup(); } catch (error) { failure ??= error; } process.removeListener("SIGINT", interrupted); process.removeListener("SIGTERM", interrupted); }
if (failure) { const message = (failure instanceof Error ? failure.message.split("\n")[0] : "Unknown failure").split(root ?? "<root>").join("<fixture>").slice(0, 350); console.error(`FAIL ${phase}: ${message}`); process.exitCode = 1; }
else console.log(JSON.stringify({ pass: true, widths: [375,1280], typedServiceState: true, noMockProductionRequestsOrStorage: true, productionDefaultUnchanged: true, sentinelsUnchanged: true, ownedCleanup: cleaned }));
