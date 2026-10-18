import type { DatabaseSync } from "node:sqlite";
import { resolveAppOrigin } from "./groups";
import { AccessError } from "./sessions";
import { requestContext } from "./accounts/context";

export type RecordTarget = { kind: "title" | "member" | "group"; id: string };
const ownershipQueries = {
  title: "SELECT group_id FROM titles WHERE id=?",
  member: "SELECT group_id FROM members WHERE id=?",
  group: "SELECT id AS group_id FROM groups WHERE id=?",
};

/** Call before returning private data or executing a mutation. Never trust payload ownership. */
export function authorizeRequest(
  db: DatabaseSync, request: Request, target?: RecordTarget,
  options: { mutation?: boolean; claimedGroupId?: unknown; configuredOrigin?: string; contextKind?: "picker" } = {},
) {
  if (options.mutation) {
    const origin = resolveAppOrigin(options.configuredOrigin).origin;
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method) || request.headers.get("origin") !== origin ||
        request.headers.get("sec-fetch-site") === "cross-site") throw new AccessError();
  }
  const session = requestContext(db, request);
  const expectedContext = options.contextKind === "picker" ? session.pickerOwnerKey : session.contextKey;
  const claimedContext = request.headers.get("x-watchnext-context");
  if (claimedContext !== null && claimedContext !== expectedContext) throw new AccessError();
  if (options.mutation && (session.mode === "account" || session.revision > 0) && claimedContext !== expectedContext) throw new AccessError();
  if (options.claimedGroupId !== undefined && options.claimedGroupId !== session.groupId) throw new AccessError();
  if (target) {
    if (!Object.hasOwn(ownershipQueries, target.kind)) throw new AccessError();
    const query = ownershipQueries[target.kind];
    if (!query || typeof target.id !== "string") throw new AccessError();
    const record = db.prepare(query).get(target.id);
    if (!record || record.group_id !== session.groupId) throw new AccessError();
  }
  return session;
}
