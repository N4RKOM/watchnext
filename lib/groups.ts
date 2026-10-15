import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

export class GroupNameError extends Error {}

export function validateGroupName(value: unknown): string {
  if (typeof value !== "string") throw new GroupNameError("Enter a group name using text.");
  const name = value.trim();
  if (!name || name.includes("\0") || [...name].length > 80) {
    throw new GroupNameError("Enter a group name from 1 to 80 characters, without null characters.");
  }
  return name;
}

export function resolveAppOrigin(configured: string | undefined): { origin: string; loopback: boolean } {
  const value = configured === undefined ? "http://127.0.0.1:3000" : configured;
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("WATCHNEXT_APP_ORIGIN must be an HTTP or HTTPS origin."); }
  if (!/^https?:\/\/[^/?#\\]+\/?$/i.test(value) || !value.trim() || value !== value.trim() || !["http:", "https:"].includes(url.protocol) ||
      url.username || url.password || /\/\/[^/]*@/.test(value) || url.pathname !== "/" ||
      value.includes("?") || value.includes("#") || url.search || url.hash) {
    throw new Error("WATCHNEXT_APP_ORIGIN must contain only an HTTP/HTTPS origin, with no credentials, path, query, or fragment.");
  }
  const hostname = url.hostname.toLowerCase();
  return { origin: url.origin, loopback: hostname === "localhost" || hostname.endsWith(".localhost") ||
    hostname.startsWith("127.") || hostname === "[::1]" };
}

/** No request headers or session state: one transaction, a hash at rest, a URL in memory. */
export function createGroup(db: DatabaseSync, rawName: unknown, configuredOrigin: string | undefined) {
  const name = validateGroupName(rawName);
  const { origin, loopback } = resolveAppOrigin(configuredOrigin);
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const groupId = randomUUID();
  const invitationId = randomUUID();
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("INSERT INTO groups(id,name) VALUES (?,?)").run(groupId, name);
    db.prepare("INSERT INTO invitations(id,group_id,token_hash) VALUES (?,?,?)").run(invitationId, groupId, tokenHash);
    db.exec("COMMIT");
    return { name, inviteUrl: `${origin}/invite/${token}`, loopback };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
