import type { DatabaseSync } from "node:sqlite";
import { authorizeRequest } from "./request-access";
import { AccessError } from "./sessions";
export function requireTitleMember(db: DatabaseSync, request: Request, options: { mutation?: boolean; configuredOrigin?: string; groupId?: unknown; memberId?: unknown } = {}) {
  const context = authorizeRequest(db, request, undefined, { mutation: options.mutation, configuredOrigin: options.configuredOrigin, claimedGroupId: options.groupId });
  if (!context.activeMemberId || (options.memberId !== undefined && options.memberId !== context.activeMemberId)) throw new AccessError();
  return context;
}
