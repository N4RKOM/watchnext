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
      await page.getByLabel("Synthetic demo notice").waitFor(); check(await page.getByText("Not available yet", { exact: true }).count() === 4, "four pending domains, no pretend working forms");
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
    await step(`${width}: synthetic register/reveal/account/signout/signin/recovery and private departure`, async () => {
      await page.goto(origin + "/mock");
      const click = name => page.getByRole("button", { name, exact: true }).click();
      const field = name => page.getByLabel(name, { exact: true });
      const username = `Mock.User${width}`, password = "synthetic browser password", replacementPassword = "replacement browser password";
      await click("Register"); await field("Username").fill(username); await field("Password").fill(password); await field("Confirm password").fill(password);
      await click("Create account"); await field("One-time synthetic recovery code").waitFor(); const proof = await field("One-time synthetic recovery code").inputValue();
      check(await page.getByRole("region", { name: "Synthetic accounts", exact: true }).locator('input[type="password"]').count() === 0, "submitted account secrets unmounted");
      await click("Continue"); await page.getByRole("heading", {name:`Account: ${username}`,exact:true}).waitFor(); check(await field("One-time synthetic recovery code").count() === 0,"registration reveal discarded"); await page.getByText("No groups yet. Group controls are in the separate synthetic groups panel.", {exact:true}).waitFor();
      await click("Sign out"); await page.getByRole("status").filter({hasText:"Signed out of the synthetic account."}).waitFor(); check(await page.getByRole("heading", {name:`Account: ${username}`,exact:true}).count() === 0,"private summary cleared on signout");
      await click("Sign in"); await field("Username").fill(username.toLowerCase()); await field("Password").fill("wrong password"); await click("Sign in to demo"); await page.getByRole("status").filter({hasText:"Username or password is incorrect."}).waitFor(); check(await field("Password").inputValue() === "","password cleared after failed submission");
      await field("Username").fill(username); await field("Password").fill(password); await page.getByRole("button",{name:"Sign in to demo",exact:true}).press("Enter"); await page.getByRole("heading", {name:`Account: ${username}`,exact:true}).waitFor();
      check(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth),"account summary no overflow");
      await click("Recover account"); await field("Username").fill(username); await field("Current recovery code").fill(proof); await field("New password").fill(replacementPassword); await field("Confirm password").fill(replacementPassword); await click("Replace password"); await field("One-time synthetic recovery code").waitFor(); const replacement = await field("One-time synthetic recovery code").inputValue(); check(replacement !== proof,"proof rotated");
      await click("Copy code"); await page.getByRole("status").filter({hasText:/Copied explicitly|Copy unavailable/}).waitFor();
      await click("Continue"); await field("Username").waitFor(); check(await field("One-time synthetic recovery code").count() === 0,"replacement reveal discarded");
      await field("Username").fill(username); await field("Password").fill(replacementPassword); await click("Sign in to demo"); await page.getByRole("heading", {name:`Account: ${username}`,exact:true}).waitFor();
      await click("Recover account"); await field("Username").fill(username); await field("Current recovery code").fill(proof); await field("New password").fill(password); await field("Confirm password").fill(password); await click("Replace password"); await page.getByRole("status").filter({hasText:"Username or recovery code is incorrect or no longer valid."}).waitFor(); check(await field("Current recovery code").inputValue() === "","proof cleared on error");
      await page.getByLabel("Simulated response").selectOption("slow"); await click("Register"); await field("Username").fill("Canceled.User"); await field("Password").fill(password); await field("Confirm password").fill(password); await click("Create account"); check(await page.getByRole("button", {name:"Create account",exact:true}).isDisabled(),"duplicate submission disabled"); await click("Cancel account request"); await page.getByRole("status").filter({hasText:"Account request canceled"}).waitFor(); check(await field("Password").inputValue() === "","cancel clears password");
      await page.getByLabel("Simulated response").selectOption("unavailable"); await field("Username").fill("Retry.User"); await field("Password").fill(password); await field("Confirm password").fill(password); await click("Create account"); await page.getByRole("status").filter({hasText:"Synthetic accounts are unavailable"}).waitFor();
      await page.getByLabel("Simulated response").selectOption("ready"); await field("Username").fill("Retry.User"); await field("Password").fill(password); await field("Confirm password").fill(password); await click("Create account"); await field("One-time synthetic recovery code").waitFor();
      await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent("pagehide", {persisted:true}))); await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent("pageshow",{persisted:true}))); check(await field("One-time synthetic recovery code").count() === 0,"bfcache departure clears disclosure");
      await click("Read account context"); await page.getByRole("heading",{name:"Account: Retry.User",exact:true}).waitFor(); await click("Reset demo"); await page.getByRole("status").filter({hasText:"Synthetic preview ready."}).waitFor(); await click("Read account context"); await page.getByRole("status").filter({hasText:"Synthetic account context ready."}).waitFor(); check(await page.getByRole("heading",{name:/Account:/}).count() === 0,"reset clears identity");
      check(!output.includes(proof) && !output.includes(replacement) && !page.url().includes(proof),"codes absent from routine output and URL"); check(unexpected.length === 0 && external.length === 0,"accounts use no backend or external requests"); check((await context.cookies()).length === 0 && await page.evaluate(()=>localStorage.length === 0 && sessionStorage.length === 0),"accounts have no durable state"); unchanged();
    });
    await step(`${width}: account groups/creator generations/rejoin and separate legacy profiles`, async () => {
      await page.goto(origin + "/mock");
      const click = name => page.getByRole("button",{name,exact:true}).click();
      const field = name => page.getByLabel(name,{exact:true});
      const groupPanel = page.getByRole("region",{name:"Synthetic groups and legacy access"});
      const signin = async username => { await click("Sign in"); await field("Username").fill(username); await field("Password").fill("synthetic password"); await click("Sign in to demo"); await page.getByRole("heading",{name:`Account: ${username}`,exact:true}).waitFor(); };
      const ready = () => groupPanel.getByRole("status").filter({hasText:"Synthetic group context ready."}).waitFor();
      await signin("Demo.Owner"); await field("New group name").fill(`Browser group ${width}`); await click("Create account group"); await field("Private synthetic invite").waitFor(); const createdInvite = await field("Private synthetic invite").inputValue();
      await click("Copy invite"); await groupPanel.getByRole("status").filter({hasText:/Copied explicitly|Select the invite and copy manually/}).waitFor(); await click("Continue to groups"); await ready(); check(await field("Private synthetic invite").count() === 0,"group creation reveal discarded"); await groupPanel.getByRole("heading",{name:`Selected group: Browser group ${width}`,exact:true}).waitFor();
      await click("Select Synthetic Friday friends"); await ready(); await click("Remove Demo.Viewer"); await groupPanel.getByRole("group",{name:"Group action confirmation"}).filter({hasText:"Remove Demo.Viewer?"}).waitFor(); await click("Cancel confirmation"); check(await groupPanel.getByText("Inactive",{exact:true}).count() === 0,"cancel removal unchanged");
      await click("Remove Demo.Viewer"); await click("Confirm removal"); await groupPanel.getByText("Inactive",{exact:false}).waitFor(); await click("Rotate synthetic invite"); await groupPanel.getByRole("group",{name:"Group action confirmation"}).filter({hasText:"Synthetic Friday friends"}).waitFor(); await click("Confirm rotation"); await field("Private synthetic invite").waitFor(); const rotatedInvite = await field("Private synthetic invite").inputValue(); await click("Continue to groups"); await ready(); await groupPanel.getByText("Invitation generation: 2",{exact:true}).waitFor();
      await signin("Demo.Viewer"); await field("Synthetic invite").fill("SYNTHETIC-FRIDAY-INITIAL"); await click("Resolve synthetic invite"); await groupPanel.getByRole("status").filter({hasText:"missing, expired or revoked"}).waitFor(); check(await field("Synthetic invite").inputValue() === "","failed invite proof cleared");
      await field("Synthetic invite").fill(rotatedInvite); await click("Resolve synthetic invite"); await groupPanel.getByText("Ready to join: Synthetic Friday friends",{exact:true}).waitFor(); await click("Join pending group"); await ready(); await groupPanel.getByRole("heading",{name:"Selected group: Synthetic Friday friends",exact:true}).waitFor(); check(await groupPanel.getByRole("button",{name:"Rotate synthetic invite",exact:true}).count() === 0,"nonowner no creator controls");
      await click("Select Synthetic weekend pair"); await groupPanel.getByRole("heading",{name:"Selected group: Synthetic weekend pair",exact:true}).waitFor(); await click("Select Synthetic Friday friends"); await groupPanel.getByRole("heading",{name:"Selected group: Synthetic Friday friends",exact:true}).waitFor();
      await click("Sign out"); await page.getByRole("status").filter({hasText:"Signed out of the synthetic account."}).waitFor(); await field("Synthetic invite").fill(createdInvite); await click("Resolve synthetic invite"); await groupPanel.getByText(/anonymous preview does not reveal/).waitFor(); check(await groupPanel.getByText(`Browser group ${width}`,{exact:true}).count() === 0,"anonymous resolution hides private name"); check(await groupPanel.getByRole("button",{name:"Join pending group",exact:true}).isDisabled(),"anonymous join blocked");
      await signin("Demo.Viewer"); await click("Load groups"); await groupPanel.getByText(`Ready to join: Browser group ${width}`,{exact:true}).waitFor(); await click("Join pending group"); await groupPanel.getByRole("heading",{name:`Selected group: Browser group ${width}`,exact:true}).waitFor();
      await click("Separate legacy mode"); await ready(); await field("New group name").fill(`Legacy browser ${width}`); await click("Create legacy group"); await field("Private synthetic invite").waitFor(); const legacyInvite = await field("Private synthetic invite").inputValue(); await click("Continue to groups"); await ready(); await groupPanel.getByText("No selected group. Legacy groups require explicit invite resolution.",{exact:true}).waitFor();
      await field("Synthetic invite").fill(legacyInvite); await click("Resolve synthetic invite"); await groupPanel.getByText("No profiles yet. Create the first profile.",{exact:true}).waitFor(); await groupPanel.getByText("No active legacy profile.",{exact:true}).waitFor();
      await field("Legacy profile name").fill("  Anna   Sample  "); await page.getByLabel("Avatar color").selectOption("rose"); await page.getByRole("button",{name:"Create and select profile",exact:true}).press("Enter"); await groupPanel.getByText("Anna Sample",{exact:true}).waitFor(); await groupPanel.getByText("A same-group legacy profile is selected.",{exact:true}).waitFor();
      await field("Legacy profile name").fill("anna sample"); await click("Create and select profile"); await groupPanel.getByRole("status").filter({hasText:"normalized name already exists"}).waitFor();
      await click("Account entry"); await click("Load groups"); await groupPanel.getByText("A same-group legacy profile is selected.",{exact:true}).waitFor(); await click("Use profile Anna Sample"); await ready(); check(await groupPanel.getByRole("button",{name:"Rotate synthetic invite",exact:true}).count() === 0,"legacy has no owner conversion");
      await page.getByLabel("Simulated response").selectOption("unavailable"); await click("Load groups"); await groupPanel.getByRole("status").filter({hasText:"Synthetic accounts are unavailable"}).waitFor(); await page.getByLabel("Simulated response").selectOption("ready"); await click("Load groups"); await ready();
      await page.getByLabel("Simulated response").selectOption("slow"); await click("Load groups"); check(await page.getByRole("button",{name:"Load groups",exact:true}).isDisabled(),"pending group duplicate disabled"); await click("Cancel group request"); await groupPanel.getByRole("status").filter({hasText:"Group request canceled"}).waitFor(); check(await groupPanel.getByText("A same-group legacy profile is selected.",{exact:true}).count() === 1,"cancel retains valid legacy selection");
      check(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth),"group/profile panels no horizontal overflow");
      if (process.env.WATCHNEXT_VISUAL_CHECK === "1") { const path = join(root, `groups-${width}.png`); await page.screenshot({path,fullPage:true}); screenshots.push(path); }
      for (const invite of [createdInvite,rotatedInvite,legacyInvite]) check(!output.includes(invite) && !page.url().includes(invite),"private synthetic invite absent from output/URL"); check(unexpected.length === 0 && external.length === 0,"groups use no production API/action/external request"); check((await context.cookies()).length === 0 && await page.evaluate(()=>localStorage.length === 0 && sessionStorage.length === 0),"groups have no durable credentials/storage"); unchanged();
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
