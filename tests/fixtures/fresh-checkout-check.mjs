import { execFileSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync, lstatSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pnpmRun } from "./guide-process.mjs";
const source = fileURLToPath(new URL("../../", import.meta.url)); let root, phase = "committed source guard";
try {
  if (process.argv.length !== 2 || execFileSync("git", ["status", "--porcelain"], { cwd: source, encoding: "utf8" }).trim()) throw new Error("Commit the selected source before isolated fresh-checkout verification");
  const revision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: source, encoding: "utf8" }).trim(); root = mkdtempSync(join(realpathSync.native(tmpdir()), "watchnext-guide-test-")); const checkout = join(root, "checkout");
  phase = "local fresh clone"; execFileSync("git", ["clone", "--no-hardlinks", "--quiet", source, checkout], { windowsHide: true, timeout: 60000, stdio: "pipe" });
  const results = [];
  for (const command of [["install", "--frozen-lockfile"], ["exec", "playwright", "install", "chromium"], ["verify:guide"], ["test"], ["typecheck"], ["build"], ["db:verify"], ["db:verify:persistence"], ["db:verify:backup"], ["test:e2e"]]) {
    phase = `fresh checkout: pnpm ${command.join(" ")}`; const output = await pnpmRun(command, checkout, { ...process.env, NEXT_TELEMETRY_DISABLED: "1" }); results.push({ command: `pnpm ${command.join(" ")}`, pass: true, ...(command[0] === "test" ? { summary: output.match(/Tests\s+\d+ passed[^\r\n]*/)?.[0] } : {}) }); console.log(`PASS ${phase}`);
  }
  console.log(JSON.stringify({ pass: true, sourceRevision: revision, results, allDataIsolated: true, noLiveProviderCalls: true, ownedCheckoutWillBeRemoved: true }));
} catch (error) { console.error(`FAIL ${phase}: ${error instanceof Error && (!root || /^Command [A-Za-z:]+ failed \(exit /.test(error.message)) ? error.message : "Documented isolated command failed; no normal data was selected. Inspect the named recipe/check."}`); process.exitCode = 1; }
finally {
  if (root) { if (dirname(resolve(root)) !== realpathSync.native(tmpdir()) || !/^watchnext-guide-test-[A-Za-z0-9]+$/.test(basename(root)) || lstatSync(root).isSymbolicLink() || realpathSync.native(root) !== root) throw new Error("Unsafe fresh-checkout cleanup refused"); rmSync(root, { recursive: true, force: true }); }
}
