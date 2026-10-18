import { execFile, spawn } from "node:child_process";
import { platform } from "node:os";
import { promisify } from "node:util";
const execute = promisify(execFile);
export function pnpmChild(args, cwd, env, collect) {
  if (!process.env.npm_execpath) throw new Error("Run the documented pnpm verification command");
  const child = spawn(process.execPath, [process.env.npm_execpath, ...args], { cwd, env, windowsHide: true, detached: platform() !== "win32", stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.on("data", data => collect(data.toString())); child.stderr.on("data", data => collect(data.toString())); child.on("error", () => {}); return child;
}
export async function stopOwned(child) {
  if (!child || !child.pid || child.exitCode !== null || child.signalCode !== null) return;
  const ended = new Promise(done => child.once("exit", done));
  // taskkill may report a descendant that exited concurrently. The definitive
  // parent acknowledgement is its exit event, which can arrive after that reply.
  if (platform() === "win32") await execute("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, timeout: 15000 }).catch(() => {});
  else { try { process.kill(-child.pid, "SIGTERM"); } catch (error) { if (error.code !== "ESRCH") throw error; } }
  let timer; try { await Promise.race([ended, new Promise((_, fail) => { timer = setTimeout(() => fail(new Error("Owned process shutdown exceeded 15 seconds")), 15000); })]); } finally { clearTimeout(timer); }
}
export async function pnpmRun(args, cwd, env) {
  let output = ""; const child = pnpmChild(args, cwd, env, value => { output += value; }); let timer;
  try {
    await new Promise((done, fail) => { timer = setTimeout(() => { void stopOwned(child).then(() => fail(new Error(`Command ${args[0]} exceeded ten minutes`)), fail); }, 600000); child.once("error", fail); child.once("exit", code => code === 0 ? done() : fail(new Error(`Command ${args[0]} failed (exit ${code}); ${args[0] === "verify:guide" ? output.match(/^FAIL guide[^\r\n]*/m)?.[0] ?? "inspect the documented isolated check" : "inspect the documented isolated check"}`))); }); return output;
  } finally { clearTimeout(timer); await stopOwned(child); }
}
