import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { requireTitleMember } from "./title-access";
import { authorizeRequest } from "./request-access";
import { AccessError } from "./sessions";
import { validateManualTitle, type ManualTitleInput } from "./title-validation";
import { safeExternalUrl } from "./urls";

export type SaveResult =
  | { kind: "created"; id: string; title: string; message: string }
  | { kind: "existing"; id: string; title: string; alreadyAdded: boolean; message: string }
  | { kind: "confirmation_required" | "archived_match"; id: string; title: string; message: string }
  | { kind: "identity_conflict"; id?: string; title?: string; message: string };
export type SaveInput = { kind: "manual"; fields: ManualTitleInput; confirmationId?: unknown } |
  { kind: "provider"; fields: ManualTitleInput; provider: { namespace: unknown; externalId: unknown; sourceUrl?: unknown; coverUrl?: unknown }; confirmationId?: unknown };
type Identity = { namespace: string; externalId: string; sourceUrl: string | null; coverUrl: string | null };
type Match = { id: string; title: string; archived: number; provider_namespace: string | null; provider_id: string | null };
export class SaveInputError extends Error { constructor() { super("The provider identity or metadata is invalid. Please check the source and try again."); } }
function validateIdentity(input: Extract<SaveInput, { kind: "provider" }>["provider"]): Identity {
  if (!input || typeof input.namespace !== "string" || !/^[a-z][a-z0-9_]{0,63}$/.test(input.namespace) || typeof input.externalId !== "string") throw new SaveInputError();
  const externalId = input.externalId.trim();
  if (!externalId || [...externalId].length > 256 || /\p{Cc}/u.test(externalId)) throw new SaveInputError();
  const optionalUrl = (value: unknown) => {
    if (value === undefined || value === null || value === "") return null;
    const url = safeExternalUrl(value); if (!url) throw new SaveInputError(); return url;
  };
  return { namespace: input.namespace, externalId, sourceUrl: optionalUrl(input.sourceUrl), coverUrl: optionalUrl(input.coverUrl) };
}

/** Server-owned input only: the manual action never forwards client-supplied provider fields. */
export function saveTitle(db: DatabaseSync, request: Request, input: SaveInput, configuredOrigin?: string): SaveResult {
  requireTitleMember(db, request, { mutation: true, configuredOrigin, groupId: input.fields.groupId, memberId: input.fields.memberId });
  if (input.kind !== "manual" && input.kind !== "provider") throw new SaveInputError();
  const value = validateManualTitle(input.fields), identity = input.kind === "provider" ? validateIdentity(input.provider) : null;
  db.exec("BEGIN IMMEDIATE");
  try {
    const context = requireTitleMember(db, request, { mutation: true, configuredOrigin, groupId: input.fields.groupId, memberId: input.fields.memberId });
    const columns = "id,title,archived,provider_namespace,provider_id";
    const manual = db.prepare(`SELECT ${columns} FROM titles WHERE group_id=? AND content_type=? AND title_key=?`).get(context.groupId, value.contentType, value.titleKey) as Match | undefined;
    const provider = identity ? db.prepare(`SELECT ${columns} FROM titles WHERE group_id=? AND provider_namespace=? AND provider_id=?`).get(context.groupId, identity.namespace, identity.externalId) as Match | undefined : undefined;
    if (input.confirmationId !== undefined) {
      if (typeof input.confirmationId !== "string") throw new AccessError();
      authorizeRequest(db, request, { kind: "title", id: input.confirmationId }, { mutation: true, configuredOrigin, claimedGroupId: input.fields.groupId });
      if (!manual || manual.id !== input.confirmationId) throw new AccessError();
    }
    const finish = (result: SaveResult) => { db.exec("COMMIT"); return result; };
    const archived = (match: Match): SaveResult => ({ kind: "archived_match", id: match.id, title: match.title, message: "This title is archived. Restoration is not available yet. Your group’s saved history has not been changed." });
    const conflict = (match: Match): SaveResult => ({ kind: "identity_conflict", id: match.id, title: match.title, message: "This identity or title belongs to a different saved entry. Nothing was merged. For a genuinely different work, use a distinguishing title such as its year." });
    const contribute = (match: Match): SaveResult => {
      if (match.archived) return archived(match);
      const alreadyAdded = Boolean(db.prepare("SELECT 1 FROM contributors WHERE title_id=? AND member_id=?").get(match.id, context.activeMemberId!));
      if (!alreadyAdded && db.prepare("INSERT INTO contributors(group_id,title_id,member_id) VALUES (?,?,?)").run(context.groupId, match.id, context.activeMemberId!).changes !== 1) throw new Error("Contribution was not saved");
      return { kind: "existing", id: match.id, title: match.title, alreadyAdded, message: alreadyAdded ? "You already added this title. Nothing was changed." : "Your name has been added to this title." };
    };
    if (provider) {
      if (input.confirmationId !== undefined && provider.id !== input.confirmationId) return finish(conflict(provider));
      return finish(contribute(provider));
    }
    if (manual) {
      if (manual.archived) return finish(archived(manual));
      if (identity && manual.provider_namespace !== null) return finish(conflict(manual));
      const alreadyAdded = Boolean(db.prepare("SELECT 1 FROM contributors WHERE title_id=? AND member_id=?").get(manual.id, context.activeMemberId!));
      if (input.confirmationId === undefined && !(alreadyAdded && !identity)) return finish({ kind: "confirmation_required", id: manual.id, title: manual.title, message: "A title with this name and type is already saved. Confirm it is the same work before adding your name, or return to editing." });
      if (identity && db.prepare("UPDATE titles SET provider_namespace=?,provider_id=? WHERE id=? AND group_id=? AND provider_namespace IS NULL AND provider_id IS NULL").run(identity.namespace, identity.externalId, manual.id, context.groupId).changes !== 1) throw new Error("Provider identity was not attached");
      return finish(contribute(manual));
    }
    const id = randomUUID();
    db.prepare("INSERT INTO titles(id,group_id,title,title_key,content_type,duration_seconds,numbering_style,provider_namespace,provider_id,source_url,cover_url,watch_url) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
      .run(id, context.groupId, value.title, value.titleKey, value.contentType, value.durationSeconds, value.numberingStyle, identity?.namespace ?? null, identity?.externalId ?? null, identity?.sourceUrl ?? null, identity?.coverUrl ?? null, value.watchUrl);
    for (const mood of value.moods) db.prepare("INSERT INTO title_moods(title_id,mood_code) VALUES (?,?)").run(id, mood);
    for (const [key, label] of value.genres) db.prepare("INSERT INTO title_genres(title_id,genre_key,label) VALUES (?,?,?)").run(id, key, label);
    if (db.prepare("INSERT INTO contributors(group_id,title_id,member_id) VALUES (?,?,?)").run(context.groupId, id, context.activeMemberId!).changes !== 1) throw new Error("Contribution was not saved");
    return finish({ kind: "created", id, title: value.title, message: "Title saved." });
  } catch (error) {
    db.exec("ROLLBACK");
    if (error instanceof Error && /UNIQUE constraint failed: titles\.(group_id, titles\.content_type, titles\.title_key|group_id, titles\.provider_namespace, titles\.provider_id)/.test(error.message)) {
      return { kind: "identity_conflict", message: "Another save used this identity. Nothing was merged. Please try again." };
    }
    throw error;
  }
}
