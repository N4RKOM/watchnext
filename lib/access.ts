import "server-only";
import { cookies, headers } from "next/headers";
import { getDatabase } from "../db/server";
import { resolveAppOrigin } from "./groups";
import { authorizeRequest, type RecordTarget } from "./request-access";
import { requireSession, sessionCookieName } from "./sessions";

export async function getActiveGroup() {
  return requireSession(getDatabase(), (await cookies()).get(sessionCookieName)?.value);
}

export async function getGroupRequest(mutation = false) {
  const origin = resolveAppOrigin(process.env.WATCHNEXT_APP_ORIGIN).origin;
  return new Request(origin, { method: mutation ? "POST" : "GET", headers: await headers() });
}

export async function requireRecordAccess(target: RecordTarget, options: { mutation?: boolean; claimedGroupId?: unknown } = {}) {
  const incoming = await headers();
  const origin = resolveAppOrigin(process.env.WATCHNEXT_APP_ORIGIN).origin;
  return authorizeRequest(getDatabase(), new Request(origin, {
    method: options.mutation ? "POST" : "GET", headers: incoming,
  }), target, { ...options, configuredOrigin: origin });
}
