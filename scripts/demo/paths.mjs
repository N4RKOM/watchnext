import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { homedir, platform, tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import { resolveDatabasePath } from "../../db/config.ts";
export class DemoSafetyError extends Error {}
export const ownerFile = ".watchnext-demo-owner.json", testOwnerFile = ".watchnext-demo-test-owner.json";
const magic = "WatchNext synthetic academic demo v1";
const key = path => platform() === "win32" ? resolve(path).toLowerCase() : resolve(path);
function ordinary(paths) {
  const existing = new Set();
  for (const path of paths) for (let part = resolve(path); ; part = dirname(part)) {
    if (existsSync(part)) {
      const stat = lstatSync(part);
      if (stat.isSymbolicLink() || (stat.isFile() && stat.nlink !== 1) || key(realpathSync.native(part)) !== key(part)) throw new DemoSafetyError("Demo paths cannot contain links, aliases or redirected destinations.");
      existing.add(part);
    } else { try { lstatSync(part); throw new DemoSafetyError("Demo paths cannot contain dangling links."); } catch (error) { if (error?.code !== "ENOENT") throw error; } }
    if (dirname(part) === part) break;
  }
  if (platform() === "win32") {
    if (paths.some(path => /^\\\\|^\/\//.test(path))) throw new DemoSafetyError("Demo storage must be on a local fixed disk.");
    const script = "$ErrorActionPreference='Stop'; try {$items=ConvertFrom-Json ([Console]::In.ReadToEnd()); foreach($p in $items){if(([IO.File]::GetAttributes([string]$p) -band [IO.FileAttributes]::ReparsePoint) -ne 0){exit 13}}; $drive=[IO.DriveInfo]::new([IO.Path]::GetPathRoot([string]$items[0])); if($drive.DriveType -ne [IO.DriveType]::Fixed){exit 14}; exit 0} catch {exit 15}";
    try { execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { input: JSON.stringify([...existing]), windowsHide: true, stdio: ["pipe", "pipe", "pipe"] }); }
    catch { throw new DemoSafetyError("Demo storage must use ordinary local files/directories without reparse points."); }
  }
}
export function claimIsolatedDemoRoot(root) {
  if (!isAbsolute(root) || key(dirname(root)) !== key(realpathSync.native(tmpdir())) || !/^watchnext-demo-(test|browser)-[A-Za-z0-9]+$/.test(basename(root))) throw new DemoSafetyError("Isolated demo roots must be directly owned temporary fixtures.");
  const marker = join(root, testOwnerFile);
  ordinary([root, marker]); if (!lstatSync(root).isDirectory()) throw new DemoSafetyError("Invalid isolated demo directory.");
  if (!existsSync(marker)) writeFileSync(marker, magic, { flag: "wx", mode: 0o600 });
  if (readFileSync(marker, "utf8") !== magic) throw new DemoSafetyError("Isolated demo root is not owned by this tool."); return root;
}
export function createIsolatedDemoRoot() { return claimIsolatedDemoRoot(mkdtempSync(join(realpathSync.native(tmpdir()), "watchnext-demo-test-"))); }
export function demoPaths(options = {}) {
  const environment = options.environment ?? process.env;
  if (["WATCHNEXT_DEMO_PATH", "WATCHNEXT_DEMO_ROOT", "WATCHNEXT_DEMO_DATABASE_PATH"].some(name => environment[name] !== undefined)) throw new DemoSafetyError("Demo storage cannot be redirected through environment overrides.");
  let root;
  if (options.testRoot !== undefined) {
    const parent = options.testRoot;
    if (!isAbsolute(parent) || key(dirname(parent)) !== key(realpathSync.native(tmpdir())) || !/^watchnext-demo-(test|browser)-[A-Za-z0-9]+$/.test(basename(parent))) throw new DemoSafetyError("Unsafe isolated demo root override.");
    ordinary([parent, join(parent, testOwnerFile)]);
    if (!existsSync(join(parent, testOwnerFile)) || readFileSync(join(parent, testOwnerFile), "utf8") !== magic) throw new DemoSafetyError("Unowned isolated demo root."); root = join(parent, "owned-demo");
  } else {
    const base = platform() === "win32" ? join(homedir(), "AppData", "Local") : platform() === "darwin" ? join(homedir(), "Library", "Application Support") : join(homedir(), ".local", "share");
    root = join(base, "WatchNextDemo", "owned-v1");
  }
  const path = join(root, "demo.sqlite"), markerPath = join(root, ownerFile);
  ordinary([root, path, markerPath]);
  for (const normal of [resolveDatabasePath(environment), resolveDatabasePath({ ...environment, WATCHNEXT_DATABASE_PATH: undefined })]) {
    const actual = existsSync(normal) ? realpathSync.native(normal) : normal;
    if (key(actual) === key(path) || key(actual).startsWith(key(root) + sep)) throw new DemoSafetyError("Refusing a demo destination selected as normal app storage. Stop the demo server and unset its database override before setup/reset.");
  }
  return { root, path, markerPath };
}
export function validateOwnedDemo(paths, create = false) {
  ordinary([paths.root, paths.path, paths.markerPath, ...["-journal", "-wal", "-shm"].map(suffix => paths.path + suffix)]);
  if (!existsSync(paths.root)) {
    if (!create) throw new DemoSafetyError("Demo storage has not been prepared.");
    mkdirSync(dirname(paths.root), { recursive: true }); mkdirSync(paths.root);
    writeFileSync(paths.markerPath, JSON.stringify({ tool: magic, id: randomUUID(), database: "demo.sqlite" }), { flag: "wx", mode: 0o600 });
  }
  if (!lstatSync(paths.root).isDirectory() || !existsSync(paths.markerPath)) throw new DemoSafetyError("Refusing an unowned demo directory.");
  let marker; try { marker = JSON.parse(readFileSync(paths.markerPath, "utf8")); } catch { throw new DemoSafetyError("The demo ownership marker is invalid."); }
  if (marker.tool !== magic || !/^[0-9a-f-]{36}$/.test(marker.id) || marker.database !== "demo.sqlite") throw new DemoSafetyError("The demo ownership marker is invalid.");
  const allowed = new Set([ownerFile, "demo.sqlite", "demo.sqlite-journal", "demo.sqlite-wal", "demo.sqlite-shm"]);
  const files = readdirSync(paths.root); if (files.some(file => !allowed.has(file))) throw new DemoSafetyError("Unexpected files in demo storage; refusing to modify it.");
  if (files.some(file => file !== ownerFile && !lstatSync(join(paths.root, file)).isFile())) throw new DemoSafetyError("Demo storage contains a non-file destination.");
  if (!existsSync(paths.path) && files.some(file => file.startsWith("demo.sqlite-"))) throw new DemoSafetyError("Orphan demo journals need manual inspection before setup.");
  return marker;
}
