// @vitest-environment node
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrate } from "../db/migrate";
import { createGroup } from "../lib/groups";
import { acceptInvitation, cookieOptions, credentialHash, requireSession, sessionCookieName, validCredential } from "../lib/sessions";
import { authorizeRequest } from "../lib/request-access";

let db: DatabaseSync;
let inviteA: string, inviteB: string, sessionA: string, groupA: string, groupB: string;
const origin = "https://watch.example";
beforeEach(() => {
  db = new DatabaseSync(":memory:"); migrate(db);
  const a = createGroup(db, "Private group A", origin), b = createGroup(db, "Private group B", origin);
  inviteA = a.inviteUrl.split("/").at(-1)!; inviteB = b.inviteUrl.split("/").at(-1)!;
  groupA = db.prepare("SELECT id FROM groups WHERE name='Private group A'").get()!.id as string;
  groupB = db.prepare("SELECT id FROM groups WHERE name='Private group B'").get()!.id as string;
  for (const [id, group] of [["title-a", groupA], ["title-b", groupB]]) db.prepare(`INSERT INTO titles(id,group_id,title,title_key,content_type,duration_seconds,numbering_style)
    VALUES (?,?,'Private title',?,'movie',100,'none')`).run(id, group, id);
  sessionA = acceptInvitation(db, inviteA);
});
afterEach(() => db.close());
const request = (credential: string | undefined, method = "GET", requestOrigin: string | null = origin) => new Request(origin + "/fixture", {
  method, headers: { ...(credential ? { cookie: `${sessionCookieName}=${credential}` } : {}), ...(requestOrigin ? { origin: requestOrigin } : {}) },
});

// Test-only request handlers: exercise the production guard, no shipped fixture endpoint.
const read = (req: Request, id: string, claimedGroupId?: unknown) => {
  try { authorizeRequest(db, req, { kind: "title", id }, { claimedGroupId }); return { status: 200, body: db.prepare("SELECT title FROM titles WHERE id=?").get(id) }; }
  catch { return { status: 403, body: { error: "Group access unavailable" } }; }
};
const mutate = (req: Request, id: string, claimedGroupId?: unknown) => {
  try { authorizeRequest(db, req, { kind: "title", id }, { mutation: true, claimedGroupId, configuredOrigin: origin });
    db.prepare("UPDATE titles SET title='Updated fixture' WHERE id=?").run(id); return { status: 200 }; }
  catch { return { status: 403 }; }
};

describe("invitation and session lifecycle", () => {
  it("accepts canonical credentials, stores only a hash and ties access to a live invitation", () => {
    expect(validCredential(sessionA)).toBe(true);
    expect(requireSession(db, sessionA)).toEqual({ groupId: groupA, groupName: "Private group A", activeMemberId: null });
    expect(db.prepare("SELECT token_hash FROM group_sessions").get()?.token_hash).toBe(credentialHash(sessionA));
    expect(Object.values(db.prepare("SELECT * FROM group_sessions").get()!).includes(sessionA)).toBe(false);
    expect(cookieOptions(origin)).toEqual({ httpOnly: true, sameSite: "lax", path: "/", secure: true });
    expect(cookieOptions("http://localhost:3000").secure).toBe(false);
  });

  it("invalid, noncanonical, unknown and revoked invites preserve existing valid context", () => {
    const noncanonical = Buffer.alloc(32).toString("base64url").slice(0, -1) + "B";
    for (const value of [undefined, "", "malformed", noncanonical, Buffer.alloc(32, 9).toString("base64url")]) expect(() => acceptInvitation(db, value, sessionA)).toThrow("Group access");
    db.prepare("UPDATE invitations SET revoked_at='revoked' WHERE token_hash=?").run(credentialHash(inviteB));
    expect(() => acceptInvitation(db, inviteB, sessionA)).toThrow("Group access");
    expect(requireSession(db, sessionA).groupId).toBe(groupA);
    expect(db.prepare("SELECT count(*) AS count FROM group_sessions").get()?.count).toBe(1);
  });

  it("rotates valid sessions, preserves same-group context, and clears member context on group switch", () => {
    db.prepare("INSERT INTO members(id,group_id,name,name_key,avatar_color) VALUES ('member-a',?,'Example','example','#1d4ed8')").run(groupA);
    db.prepare("UPDATE group_sessions SET active_member_id='member-a' WHERE token_hash=?").run(credentialHash(sessionA));
    const same = acceptInvitation(db, inviteA, sessionA);
    expect(requireSession(db, same).activeMemberId).toBe("member-a");
    expect(() => requireSession(db, sessionA)).toThrow("Group access");
    const other = acceptInvitation(db, inviteB, same);
    expect(requireSession(db, other)).toEqual({ groupId: groupB, groupName: "Private group B", activeMemberId: null });
    expect(db.prepare("SELECT count(*) AS count FROM members").get()?.count).toBe(1);
    expect(db.prepare("SELECT count(*) AS count FROM titles").get()?.count).toBe(2);
  });

  it("rejects a session bound to another group's invitation and denies a stale missing backing invitation", () => {
    const invitationB = db.prepare("SELECT id FROM invitations WHERE token_hash=?").get(credentialHash(inviteB))!.id;
    expect(() => db.prepare("UPDATE group_sessions SET invitation_id=? WHERE token_hash=?").run(invitationB, credentialHash(sessionA))).toThrow(/FOREIGN KEY/);
    // Simulate an externally corrupted/legacy reference; normal foreign keys prevent it.
    db.exec("PRAGMA foreign_keys=OFF");
    db.prepare("DELETE FROM invitations WHERE token_hash=?").run(credentialHash(inviteA));
    db.exec("PRAGMA foreign_keys=ON");
    expect(read(request(sessionA), "title-a").status).toBe(403);
    expect(mutate(request(sessionA, "POST"), "title-a").status).toBe(403);
    expect(db.prepare("SELECT title FROM titles WHERE id='title-a'").get()?.title).toBe("Private title");
  });
});

describe("request-layer ownership and mutation boundaries", () => {
  it("allows same-group reads/mutations and denies a known other-group ID or forged group payload", () => {
    expect(read(request(sessionA), "title-a").status).toBe(200);
    expect(mutate(request(sessionA, "POST"), "title-a", groupA).status).toBe(200);
    expect(read(request(sessionA), "title-b").body).toEqual({ error: "Group access unavailable" });
    expect(mutate(request(sessionA, "POST"), "title-b", groupA).status).toBe(403);
    expect(read(request(sessionA), "title-a", groupB).status).toBe(403);
    expect(mutate(request(sessionA, "POST"), "title-a", groupB).status).toBe(403);
    expect(db.prepare("SELECT title FROM titles WHERE id='title-b'").get()?.title).toBe("Private title");
  });

  it("missing, forged, malformed, deleted-session and revoked-invitation access returns no data or writes", () => {
    for (const credential of [undefined, "bad", Buffer.alloc(32, 8).toString("base64url")]) {
      expect(read(request(credential), "title-a")).toEqual({ status: 403, body: { error: "Group access unavailable" } });
      expect(mutate(request(credential, "POST"), "title-a").status).toBe(403);
    }
    db.prepare("UPDATE invitations SET revoked_at='revoked' WHERE token_hash=?").run(credentialHash(inviteA));
    expect(read(request(sessionA), "title-a").status).toBe(403);
    expect(mutate(request(sessionA, "POST"), "title-a").status).toBe(403);
    db.prepare("DELETE FROM group_sessions").run();
    expect(read(request(sessionA), "title-a").status).toBe(403);
    expect(db.prepare("SELECT title FROM titles WHERE id='title-a'").get()?.title).toBe("Private title");
  });

  it("rejects missing/cross-origin mutation origins, cross-site metadata, duplicate cookies, and unknown targets", () => {
    for (const attemptedOrigin of [null, "https://evil.example"]) expect(mutate(request(sessionA, "POST", attemptedOrigin), "title-a").status).toBe(403);
    const crossSite = request(sessionA, "POST"); crossSite.headers.set("sec-fetch-site", "cross-site");
    expect(mutate(crossSite, "title-a").status).toBe(403);
    expect(mutate(request(sessionA), "title-a").status).toBe(403);
    const duplicates = request(sessionA); duplicates.headers.append("cookie", `; ${sessionCookieName}=${sessionA}`);
    expect(read(duplicates, "title-a").status).toBe(403);
    expect(read(request(sessionA), "unknown").status).toBe(403);
  });
});
