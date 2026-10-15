// @vitest-environment node
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrate } from "../db/migrate";
import { createGroup, resolveAppOrigin, validateGroupName } from "../lib/groups";

let db: DatabaseSync;
beforeEach(() => { db = new DatabaseSync(":memory:"); migrate(db); });
afterEach(() => db.close());
const count = (table: string) => db.prepare(`SELECT count(*) AS count FROM ${table}`).get()?.count;

describe("group creation storage", () => {
  it("atomically saves the trimmed display name, one invite hash, and no profiles", () => {
    const result = createGroup(db, "  Film  Friends  ", undefined);
    expect(result.name).toBe("Film  Friends");
    expect(db.prepare("SELECT name FROM groups").get()?.name).toBe("Film  Friends");
    expect(count("groups")).toBe(1);
    expect(count("invitations")).toBe(1);
    expect(count("members")).toBe(0);
    const token = new URL(result.inviteUrl).pathname.split("/").at(-1)!;
    expect(token.length === 43 && /^[A-Za-z0-9_-]+$/.test(token)).toBe(true);
    expect(Buffer.from(token, "base64url").length).toBe(32);
    const invite = db.prepare("SELECT * FROM invitations").get()!;
    expect(invite.token_hash).toBe(createHash("sha256").update(token).digest("hex"));
    expect(Object.values(invite).includes(token)).toBe(false);
    expect(invite.revoked_at).toBeNull();
    expect(result.loopback).toBe(true);
  });

  it("same names create separate group identities and invitation credentials", () => {
    const first = createGroup(db, "Same name", "https://watch.example/");
    const second = createGroup(db, "Same name", "https://watch.example");
    expect(first.inviteUrl !== second.inviteUrl).toBe(true);
    expect(count("groups")).toBe(2);
    expect(db.prepare("SELECT count(DISTINCT id) AS count FROM groups").get()?.count).toBe(2);
    expect(db.prepare("SELECT count(DISTINCT token_hash) AS count FROM invitations").get()?.count).toBe(2);
    expect(db.prepare("SELECT count(DISTINCT group_id) AS count FROM invitations").get()?.count).toBe(2);
  });

  it("accepts one and eighty Unicode code points and rejects invalid inputs before writing", () => {
    expect(validateGroupName(" a ")).toBe("a");
    createGroup(db, "😀".repeat(80), undefined);
    expect(count("groups")).toBe(1);
    for (const value of ["", " \t\n ", "x".repeat(81), "😀".repeat(81), "bad\0name", undefined, null, 42, new Blob(["name"])]) {
      expect(() => createGroup(db, value, undefined)).toThrow();
    }
    expect(count("groups")).toBe(1);
    expect(count("invitations")).toBe(1);
  });

  it("rolls back group creation if invitation insertion fails, and permits a later retry", () => {
    db.exec("CREATE TEMP TRIGGER fail_invitation BEFORE INSERT ON invitations BEGIN SELECT RAISE(ABORT, 'Synthetic invitation failure'); END;");
    expect(() => createGroup(db, "Retry example", undefined)).toThrow("Synthetic invitation failure");
    expect(count("groups")).toBe(0);
    expect(count("invitations")).toBe(0);
    db.exec("DROP TRIGGER fail_invitation");
    createGroup(db, "Retry example", undefined);
    expect(count("groups")).toBe(1);
    expect(count("invitations")).toBe(1);
  });
});

describe("configured invitation origin", () => {
  it("uses only the configured origin, canonicalizes one slash, and identifies loopback", () => {
    expect(resolveAppOrigin(undefined)).toEqual({ origin: "http://127.0.0.1:3000", loopback: true });
    for (const origin of ["http://localhost:3100", "http://127.0.0.1:3000/", "http://[::1]:3000"]) expect(resolveAppOrigin(origin).loopback).toBe(true);
    expect(resolveAppOrigin("https://watch.example/")).toEqual({ origin: "https://watch.example", loopback: false });
  });

  it("rejects invalid explicit origins instead of silently falling back or writing records", () => {
    for (const origin of ["", " ", "not-url", "ftp://watch.example", "https:watch.example", "https://user:pass@watch.example", "https://@watch.example", "https://watch.example/path", "https://watch.example/../", "https://watch.example//", "https://watch.example?", "https://watch.example#", "https://watch.example?q=a", "https://watch.example/#fragment"]) {
      expect(() => createGroup(db, "Valid name", origin)).toThrow("WATCHNEXT_APP_ORIGIN");
    }
    expect(count("groups")).toBe(0);
    expect(count("invitations")).toBe(0);
  });
});
