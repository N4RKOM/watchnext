import { accessSync, constants, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
// Explicit extensions are resolved by Node's native TypeScript loader in CLI use.
// @ts-expect-error Node executes the source .ts file directly; no TypeScript emit is used.
import { resolveDatabasePath, type DatabaseEnvironment } from "./config.ts";
// @ts-expect-error Node executes the source .ts file directly; no TypeScript emit is used.
import { assertCurrentSchema, migrate } from "./migrate.ts";
// @ts-expect-error Node executes this source directly for maintenance/CLI use.
import { ensureFreshMetadata, startMetadataMaintenance } from "../lib/metadata/lifecycle.ts";

if (typeof window !== "undefined") throw new Error("WatchNext database access is server-only and cannot run in a browser");

type ConnectionState = { path: string; connection: DatabaseSync; stopMaintenance?: () => void };
const state = globalThis as typeof globalThis & { __watchNextDatabase?: ConnectionState };

function open(path: string, initialize: boolean): DatabaseSync {
  let connection: DatabaseSync | undefined;
  try {
    if (initialize) mkdirSync(dirname(path), { recursive: true });
    if (!initialize && !existsSync(path)) throw new Error("Database is not initialized; run pnpm db:init first");
    if (existsSync(path)) {
      const metadata = statSync(path);
      if (!metadata.isFile()) throw new Error("Configured database destination is not a regular file");
      if ((metadata.mode & 0o222) === 0) throw new Error("Configured database file is read-only");
      accessSync(path, constants.R_OK | constants.W_OK);
    }
    accessSync(dirname(path), constants.R_OK | constants.W_OK);
    connection = new DatabaseSync(path);
    connection.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
    return connection;
  } catch (cause) {
    connection?.close();
    throw new Error(`Cannot open WatchNext database at ${path}: ${cause instanceof Error ? cause.message : String(cause)}`, { cause });
  }
}

/** Explicit setup operation; never seeds or resets user records. */
export function initializeDatabase(environment: DatabaseEnvironment = process.env): { path: string; applied: string[] } {
  const path = resolveDatabasePath(environment);
  const connection = open(path, true);
  try {
    return { path, applied: migrate(connection) };
  } catch (cause) {
    throw new Error(`Cannot initialize WatchNext database at ${path}: ${cause instanceof Error ? cause.message : String(cause)}`, { cause });
  } finally {
    connection.close();
  }
}

/** Shared Node entry; application modules import this through db/server.ts. */
export function getDatabase(environment: DatabaseEnvironment = process.env): DatabaseSync {
  const path = resolveDatabasePath(environment);
  if (state.__watchNextDatabase) {
    if (state.__watchNextDatabase.path !== path) throw new Error("Database path changed while a connection is open; closeDatabase() before switching configuration");
    if (state.__watchNextDatabase.connection.isOpen) { ensureFreshMetadata(state.__watchNextDatabase.connection); state.__watchNextDatabase.stopMaintenance?.(); state.__watchNextDatabase.stopMaintenance = startMetadataMaintenance(state.__watchNextDatabase.connection); return state.__watchNextDatabase.connection; }
    delete state.__watchNextDatabase;
  }
  const connection = open(path, false);
  try {
    assertCurrentSchema(connection);
    ensureFreshMetadata(connection);
  } catch (cause) {
    connection.close();
    throw new Error(`Database at ${path} needs initialization: run pnpm db:init. ${cause instanceof Error ? cause.message : String(cause)}`, { cause });
  }
  state.__watchNextDatabase = { path, connection, stopMaintenance: startMetadataMaintenance(connection) };
  return connection;
}

/** Explicit shutdown/test reset. Safe to call more than once. */
export function closeDatabase(): void {
  state.__watchNextDatabase?.stopMaintenance?.();
  if (state.__watchNextDatabase?.connection.isOpen) state.__watchNextDatabase.connection.close();
  delete state.__watchNextDatabase;
}
