// @vitest-environment node
import { spawn } from "node:child_process";
import { platform } from "node:os";
import { expect, it } from "vitest";
import { stopOwned } from "./fixtures/guide-process.mjs";
it("waits for real owned process exit after a bounded tree shutdown and tolerates repeated stop", async () => {
  const child = spawn(process.execPath, ["-e", "console.log('ready'); setInterval(()=>{},1000)"], { windowsHide: true, detached: platform() !== "win32", stdio: ["ignore", "pipe", "pipe"] });
  try {
    await new Promise<void>((done, fail) => { child.once("error", fail); child.stdout.once("data", () => done()); });
    await stopOwned(child); expect(child.exitCode !== null || child.signalCode !== null).toBe(true); await stopOwned(child);
  } finally { await stopOwned(child); }
}, 30000);
