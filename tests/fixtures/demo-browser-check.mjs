import { join } from "node:path";
import { claimIsolatedDemoRoot } from "../../scripts/demo/paths.mjs";
import { prepareDemo } from "../../scripts/demo/prepare.mjs";
import { withBrowserFixture } from "./browser-fixture.mjs";
let seeded;
await withBrowserFixture("demo", async ({ db, origin, secrets, check, createContext, phase }) => {
  const token = seeded.inviteUrl.split("/").at(-1); secrets.push(token);
  const invite = `${origin}/invite/${token}`, report = [];
  const histories = () => JSON.stringify(["progress", "ratings", "notes"].map(table => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()));
  async function choose(page, name) { await page.goto(origin + "/group"); await page.getByRole("button", { name: `${name} Select`, exact: true }).click(); await page.getByRole("button", { name: `${name} Active`, exact: true }).waitFor(); }
  async function settings(page, mood, minutes, rewatches = false, viewers = ["Anna", "Max"]) {
    await page.goto(origin + "/pick"); for (const name of viewers) await page.getByRole("checkbox", { name, exact: true }).check();
    await page.getByLabel("Available time (whole minutes)").fill(minutes); await page.getByLabel("Mood", { exact: true }).selectOption(mood); if (rewatches) await page.getByLabel("Rewatches OK").check();
  }
  async function pick(page, title) {
    const response = page.waitForResponse(response => response.request().method() === "POST" && new URL(response.url()).pathname === "/pick");
    await page.getByRole("button", { name: /^(Pick for me|Pick again|Start again)$/ }).press("Enter"); await response;
    await page.getByRole("heading", { name: title, exact: true }).waitFor();
  }
  for (const width of [375, 1280]) {
    phase(`${width}: ordinary invitation/profile/watchlist`);
    const contexts = await Promise.all([createContext(width), createContext(width)]), [a, b] = await Promise.all(contexts.map(context => context.newPage()));
    for (const page of [a, b]) { await page.goto(invite); await page.waitForURL("**/group"); }
    for (const context of contexts) for (const cookie of await context.cookies()) if(cookie.name !== "watchnext_access_mode") secrets.push(cookie.value);
    await choose(a, "Anna"); await choose(b, "Max"); await a.goto(origin + "/watchlist");
    for (const title of ["Fictional Funny Film", "Fictional Short Sketches", "Fictional Space Sitcom", "Fictional Quiet Quest", "Fictional Heartfelt Film"]) await a.getByRole("heading", { name: title, exact: true }).waitFor();
    check(await a.getByRole("heading", { name: "Fictional Archive Keepsake", exact: true }).count() === 0, "Archived title absent from active list");
    const before = histories(); phase(`${width}: persisted picker scenarios`);
    await settings(a, "funny", "25"); await pick(a, "Fictional Funny Film"); await a.getByText("Movie · Full duration: 24 min", { exact: true }).waitFor(); await pick(a, "Fictional Short Sketches"); await pick(a, "All matches shown");
    await settings(a, "exciting", "20"); await pick(a, "Fictional Short Sketches"); await a.getByText("Requested Exciting; different mood: Funny. Within your available time.", { exact: true }).waitFor();
    await a.getByLabel("Rewatches OK").check(); await pick(a, "Fictional Space Sitcom"); await a.getByText("Season 1, episode 3", { exact: true }).waitFor(); check((await a.getByRole("region", { name: "Fictional Space Sitcom", exact: true }).textContent()).includes("RewatchingMMax"), "Max catches up at Anna's episode");
    await settings(a, "dark", "23", true); await pick(a, "Fictional Quiet Quest"); await a.getByText("Episode 2", { exact: true }).waitFor(); check((await a.getByRole("region", { name: "Fictional Quiet Quest", exact: true }).textContent()).includes("RewatchingAAnna"), "Anna catches up at Max's continuous episode");
    await settings(a, "emotional", "25", false, ["Anna"]); await pick(a, "Fictional Heartfelt Film"); await a.getByText("2 minutes longer than your available time.", { exact: true }).waitFor(); check(await a.getByLabel("Available time (whole minutes)").inputValue() === "25", "Overrun leaves requested budget unchanged");
    check(histories() === before, "All picks preserve personal progress and feedback");
    phase(`${width}: independent details and same-ID archive restoration`);
    for (const page of [a, b]) { await page.goto(origin + "/watchlist/demo-funny-24"); await page.getByRole("heading", { name: "Fictional Funny Film", exact: true }).waitFor(); check((await page.locator("main").textContent()).includes("Anna's fictional"), "Anna's multiline fictional feedback visible"); check((await page.locator("main").textContent()).includes("Max's fictional"), "Max's multiline fictional feedback visible"); }
    check(await a.getByLabel("Stopped at", { exact: true }).inputValue() === "10:00" && await b.getByLabel("Stopped at", { exact: true }).inputValue() === "2:00", "Each browser reads its own saved timestamp");
    check(await a.getByLabel("Rating (1–10)", { exact: true }).inputValue() === "9" && await b.getByLabel("Rating (1–10)", { exact: true }).inputValue() === "6", "Each browser reads its own whole-title rating");
    await a.goto(origin + "/archive"); await a.getByRole("heading", { name: "Fictional Archive Keepsake", exact: true }).waitFor(); await a.goto(origin + "/watchlist/demo-archive");
    const archivedHistory = histories(); await a.getByRole("button", { name: "Restore to watchlist", exact: true }).press("Enter"); await a.getByRole("button", { name: "Remove my contribution", exact: true }).waitFor();
    check(new URL(a.url()).pathname === "/watchlist/demo-archive" && db.prepare("SELECT archived FROM titles WHERE id='demo-archive'").get().archived === 0, "Restore preserves stable title identity"); check(histories() === archivedHistory, "Restore preserves every personal history row");
    await a.getByRole("button", { name: "Remove my contribution", exact: true }).click(); await a.getByRole("button", { name: "Confirm removal", exact: true }).press("Enter"); await a.getByRole("button", { name: "Restore to watchlist", exact: true }).waitFor(); check(histories() === archivedHistory, "Final removal preserves history");
    check(await a.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "No horizontal overflow"); await a.getByRole("button", { name: "Restore to watchlist", exact: true }).focus(); check(await a.getByRole("button", { name: "Restore to watchlist", exact: true }).evaluate(element => getComputedStyle(element).outlineStyle !== "none"), "Visible keyboard focus");
    for (const context of contexts) await context.close(); report.push({ width, twoOrdinaryJoins: true, realSeededWatchlist: true, exactOrderExhaustion: true, differentMoodExclusion: true, bothCatchupNumberingStyles: true, disclosedOverrun: true, attributedIndependentHistory: true, sameIdRestoreArchive: true, noOverflowKeyboard: true });
  }
  return report;
}, { databasePath(root) { claimIsolatedDemoRoot(root); seeded = prepareDemo({ testRoot: root, environment: { LOCALAPPDATA: join(root, "normal-local"), XDG_DATA_HOME: join(root, "normal-local") }, showInvite: true }); return seeded.path; } });
