import { homedir, platform } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

export type DatabaseEnvironment = Readonly<Record<string, string | undefined>>;

/** No filesystem access: tests can supply an isolated user-data environment. */
export function resolveDatabasePath(
  environment: DatabaseEnvironment = process.env,
  cwd = process.cwd(),
  os = platform(),
  home = homedir(),
): string {
  const configured = environment.WATCHNEXT_DATABASE_PATH;
  if (configured !== undefined) {
    if (!configured.trim() || configured.includes("\0") || configured === ":memory:" || /^file:/i.test(configured)) {
      throw new Error("WATCHNEXT_DATABASE_PATH must be a nonblank filesystem file path; in-memory/URI databases are unsupported");
    }
    if (/[\\/]$/.test(configured)) throw new Error("WATCHNEXT_DATABASE_PATH must name a file, not a directory");
    return resolve(cwd, configured);
  }

  let base: string;
  if (os === "win32") base = environment.LOCALAPPDATA ?? join(home, "AppData", "Local");
  else if (os === "darwin") base = join(home, "Library", "Application Support");
  else base = environment.XDG_DATA_HOME ?? join(home, ".local", "share");
  if (!base.trim() || !isAbsolute(base) || base.includes("\0")) {
    throw new Error("The local user-data directory must be an absolute filesystem path");
  }
  return join(base, "WatchNext", "watchnext.sqlite");
}
