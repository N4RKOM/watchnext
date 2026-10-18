// @vitest-environment node
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { migrate } from "../../db/migrate";
import { accountCookieName, accountCredential, currentAccount, loginAccount, logoutAccount, registerAccount } from "../../lib/accounts/service";
import { security } from "../../lib/accounts/security";
import { credentialHash } from "../../lib/sessions";
let root: string, db: DatabaseSync;
const password = " Exact password 🔒 ";
const fields = (username: string) => ({ username, password, confirmation: password });
beforeEach(() => { root = mkdtempSync(join(tmpdir(), "watchnext-auth-test-")); db = new DatabaseSync(join(root, "auth.sqlite")); migrate(db); security.signupTotal.clear("all"); });
afterEach(() => { db.close(); if (dirname(resolve(root)) !== resolve(tmpdir()) || !basename(root).startsWith("watchnext-auth-test-")) throw new Error("Unsafe cleanup"); rmSync(root, { recursive: true, force: true }); });

it("creates real independent account/session, one-way recovery, fixed parameters, no memberships and duplicate race rollback", async () => {
  const results = await Promise.allSettled([registerAccount(db, fields(" Race.User "), undefined, 100), registerAccount(db, fields("race.user"), undefined, 100)]);
  expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
  const success = results.find(result => result.status === "fulfilled")!;
  if (success.status !== "fulfilled") throw new Error("Missing success");
  const result = success.value, row = db.prepare("SELECT * FROM accounts").get()!;
  expect(result.recoveryCode).toMatch(/^[A-Za-z0-9_-]{43}$/); expect(result.credential).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(row.recovery_digest).toBe(credentialHash(result.recoveryCode));
  expect(row.password_hash).not.toContain(password); expect(row.password_n).toBe(131072);
  expect(JSON.stringify(db.prepare("SELECT * FROM account_sessions").all())).not.toContain(result.credential);
  expect(db.prepare("SELECT count(*) AS n FROM account_sessions").get()?.n).toBe(1);
  expect(db.prepare("SELECT * FROM account_memberships").all()).toEqual([]);
  expect(currentAccount(db, result.credential, 101)?.id).toBe(row.id);
});
it("rotates only after successful login, preserves second browser, persists after reopen, expires and revokes", async () => {
  const registered = await registerAccount(db, fields("Rotate.User"), undefined, 100);
  const second = await loginAccount(db, { username: "ROTATE.USER", password }, undefined, 101);
  const rotated = await loginAccount(db, { username: "rotate.user", password }, registered.credential, 102);
  expect(currentAccount(db, registered.credential, 103)).toBeNull();
  expect(currentAccount(db, second.credential, 103)?.username).toBe("Rotate.User");
  expect(currentAccount(db, rotated.credential, 103)).not.toBeNull();
  await expect(loginAccount(db, { username: "rotate.user", password: "wrong password value" }, second.credential, 104)).rejects.toThrow("Username or password is incorrect.");
  await expect(loginAccount(db, { username: "Unknown.User", password: "wrong password value" }, second.credential, 104)).rejects.toThrow("Username or password is incorrect.");
  expect(currentAccount(db, second.credential, 105)).not.toBeNull();
  db.close(); db = new DatabaseSync(join(root, "auth.sqlite"));
  expect(currentAccount(db, second.credential, 105)).not.toBeNull();
  logoutAccount(db, rotated.credential, 106); expect(currentAccount(db, rotated.credential, 107)).toBeNull();
  expect(currentAccount(db, second.credential, 101 + 604800)).toBeNull();
  expect(currentAccount(db, "tampered")).toBeNull();
  expect(accountCredential(`${accountCookieName}=one; ${accountCookieName}=two`)).toBeUndefined();
});
it("session insert failure rolls back registration and login without revoking a valid old session", async () => {
  const old = await registerAccount(db, fields("Rollback.User"), undefined, 100);
  db.exec("CREATE TRIGGER synthetic_session_failure BEFORE INSERT ON account_sessions BEGIN SELECT RAISE(ABORT,'synthetic'); END");
  await expect(registerAccount(db, fields("Failed.New"), old.credential, 101)).rejects.toThrow();
  expect(db.prepare("SELECT * FROM accounts WHERE username_key='failed.new'").all()).toEqual([]);
  await expect(loginAccount(db, { username: "Rollback.User", password }, old.credential, 102)).rejects.toThrow();
  expect(currentAccount(db, old.credential, 103)).not.toBeNull();
  expect(db.prepare("SELECT count(*) AS n FROM account_sessions").get()?.n).toBe(1);
  db.exec("DROP TRIGGER synthetic_session_failure");
  expect((await loginAccount(db, { username: "Rollback.User", password }, old.credential, 104)).credential).not.toBe(old.credential);
});
it("validates missing/confirmation/oversized values before writes and safely rejects malformed stored parameters", async () => {
  for (const input of [{}, { ...fields("Validation.User"), confirmation: "different" }, { ...fields("Validation.User"), password: "a".repeat(129) }]) await expect(registerAccount(db, input)).rejects.toThrow();
  expect(db.prepare("SELECT * FROM accounts").all()).toEqual([]);
  await registerAccount(db, fields("Validation.User"));
  db.exec("UPDATE accounts SET password_n=16384");
  await expect(loginAccount(db, { username: "Validation.User", password })).rejects.toThrow("Username or password is incorrect.");
});
