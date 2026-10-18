import "server-only";
import { headers } from "next/headers";
import { getDatabase } from "../db/server";
import { resolveAppOrigin } from "./groups";
import { authorizeRequest, type RecordTarget } from "./request-access";

export async function getActiveGroup() {
  return authorizeRequest(getDatabase(), await getGroupRequest());
}

export async function getGroupRequest(mutation = false, contextKey?: string) {
  const origin = resolveAppOrigin(process.env.WATCHNEXT_APP_ORIGIN).origin;
  const incoming = new Headers(await headers());
  incoming.delete("x-watchnext-context");
  if (contextKey !== undefined) incoming.set("x-watchnext-context", contextKey);
  return new Request(origin, { method: mutation ? "POST" : "GET", headers: incoming });
}

export async function getActionContext(kind?: "picker") { const context = await getActiveGroup(); return kind === "picker" ? context.pickerOwnerKey : context.contextKey; }

export async function requireRecordAccess(target: RecordTarget, options: { mutation?: boolean; claimedGroupId?: unknown } = {}) {
  const incoming = await headers();
  const origin = resolveAppOrigin(process.env.WATCHNEXT_APP_ORIGIN).origin;
  return authorizeRequest(getDatabase(), new Request(origin, {
    method: options.mutation ? "POST" : "GET", headers: incoming,
  }), target, { ...options, configuredOrigin: origin });
}
