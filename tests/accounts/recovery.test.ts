// @vitest-environment node
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { migrate } from "../../db/migrate";
import { currentAccount, loginAccount, recoverAccount, recoveryFailure, registerAccount } from "../../lib/accounts/service";
import { security } from "../../lib/accounts/security";
import { credentialHash } from "../../lib/sessions";
let db: DatabaseSync;
const old = " Old password exact 🔒 ", next = " New password exact 🔓 ";
const registration = (username: string) => registerAccount(db, { username, password: old, confirmation: old }, undefined, 100);
const reset = (username: unknown, recoveryCode: unknown, password = next) => recoverAccount(db, { username, recoveryCode, password, confirmation: password }, 200);
beforeEach(() => { db = new DatabaseSync(":memory:"); migrate(db); security.signupTotal.clear("all"); security.recoveryTotal.clear("all"); });
afterEach(() => { db.close(); vi.restoreAllMocks(); });

it("proof rotates exact credentials/code, revokes all target sessions only, creates no session and preserves every business value", async () => {
  const a = await registration("Recover.Target"), b = await registration("Recover.Other");
  const otherSession = await loginAccount(db, { username: "Recover.Target", password: old }, undefined, 101);
  const id = currentAccount(db, a.credential, 102)!.id;
  db.prepare("INSERT INTO groups(id,name,access_mode,owner_account_id) VALUES ('auth','Account fixture','account',?)").run(id);
  db.exec(`INSERT INTO groups(id,name) VALUES ('legacy','Legacy fixture');
    INSERT INTO invitations(id,group_id,token_hash) VALUES ('inv','legacy','synthetic-invite-digest');
    INSERT INTO members(id,group_id,name,name_key,avatar_color) VALUES ('member','auth','Target','target','#1d4ed8'),('old','legacy','Legacy','legacy','#1d4ed8');
    INSERT INTO group_sessions(token_hash,group_id,invitation_id,active_member_id) VALUES ('${"d".repeat(64)}','legacy','inv','old');
    INSERT INTO titles(id,group_id,title,title_key,content_type,duration_seconds,numbering_style) VALUES ('t','auth','Keep me','keep me','movie',120,'none'),('old-title','legacy','Legacy film','legacy film','movie',50,'none');
    INSERT INTO contributors(group_id,title_id,member_id) VALUES ('auth','t','member'),('legacy','old-title','old');
    INSERT INTO progress(group_id,title_id,member_id,numbering_style,timestamp_seconds) VALUES ('auth','t','member','none',8),('legacy','old-title','old','none',9);
    INSERT INTO ratings VALUES ('auth','t','member',8); INSERT INTO notes VALUES ('auth','t','member','Preserve note');
    INSERT INTO title_moods VALUES ('t','funny'); INSERT INTO title_genres VALUES ('t','comedy','Comedy');
    INSERT INTO metadata_fields(title_id,field,origin) VALUES ('t','title','user');
    INSERT INTO metadata_reviews(handle_hash,group_id,member_id,session_id,expires_at,payload) VALUES ('synthetic','auth','member','synthetic','2026-10-31','{}');`);
  db.prepare("INSERT INTO account_memberships(account_id,group_id,member_id,joined_invite_generation) VALUES (?,'auth','member',1)").run(id);
  const business = () => JSON.stringify(db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT IN ('accounts','account_sessions') ORDER BY name").all()
    .map(row => db.prepare(`SELECT * FROM "${row.name}" ORDER BY rowid`).all()));
  const before = business(), other = db.prepare("SELECT * FROM accounts WHERE username_key='recover.other'").get();
  const result = await reset("  RECOVER.TARGET ", a.recoveryCode);
  expect(result.recoveryCode).not.toBe(a.recoveryCode); expect(result.recoveryCode).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(db.prepare("SELECT recovery_digest FROM accounts WHERE id=?").get(id)?.recovery_digest).toBe(credentialHash(result.recoveryCode));
  expect(currentAccount(db, a.credential, 201)).toBeNull(); expect(currentAccount(db, otherSession.credential, 201)).toBeNull();
  expect(currentAccount(db, b.credential, 201)).not.toBeNull();
  expect(db.prepare("SELECT count(*) AS n FROM account_sessions").get()?.n).toBe(3);
  expect(db.prepare("SELECT * FROM accounts WHERE username_key='recover.other'").get()).toEqual(other); expect(business()).toBe(before);
  await expect(reset("Recover.Target", a.recoveryCode)).rejects.toThrow(recoveryFailure);
  await expect(loginAccount(db, { username: "Recover.Target", password: old })).rejects.toThrow("Username or password is incorrect.");
  await loginAccount(db, { username: "Recover.Target", password: next });
  const later = await reset("Recover.Target", result.recoveryCode, old); expect(later.recoveryCode).not.toBe(result.recoveryCode);
});
it("unknown/wrong/missing/malformed proof and invalid username share generic failure and consume separate admission", async () => {
  const a = await registration("Invalid.Proof");
  for (const [username, code] of [["Unknown.Proof", a.recoveryCode], ["Invalid.Proof", "a".repeat(43)], ["Invalid.Proof", undefined], ["Invalid.Proof", {}], ["bad name", a.recoveryCode]]) await expect(reset(username, code)).rejects.toThrow(recoveryFailure);
  expect(currentAccount(db, a.credential, 101)).not.toBeNull();
  await loginAccount(db, { username: "Invalid.Proof", password: old });
});
it("two concurrent consumers have exactly one winner and no partial losing reset", async () => {
  const a = await registration("Race.Recovery");
  const results = await Promise.allSettled([reset("Race.Recovery", a.recoveryCode, next), reset("Race.Recovery", a.recoveryCode, old)]);
  expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
  const index = results.findIndex(result => result.status === "fulfilled");
  await loginAccount(db, { username: "Race.Recovery", password: index === 0 ? next : old });
  const success = results[index]; if (success.status !== "fulfilled") throw new Error("No winner");
  expect(db.prepare("SELECT recovery_digest FROM accounts").get()?.recovery_digest).toBe(credentialHash(success.value.recoveryCode));
});
it("a revocation write failure rolls back password, code and every session, and retry can use the same code", async () => {
  const a = await registration("Rollback.Recovery");
  const before = JSON.stringify([db.prepare("SELECT * FROM accounts").all(), db.prepare("SELECT * FROM account_sessions").all()]);
  db.exec("CREATE TRIGGER synthetic_failure BEFORE UPDATE ON account_sessions BEGIN SELECT RAISE(ABORT,'synthetic'); END");
  await expect(reset("Rollback.Recovery", a.recoveryCode)).rejects.toThrow();
  expect(JSON.stringify([db.prepare("SELECT * FROM accounts").all(), db.prepare("SELECT * FROM account_sessions").all()])).toBe(before);
  db.exec("DROP TRIGGER synthetic_failure"); await reset("Rollback.Recovery", a.recoveryCode);
});
it("an old-password login held across committed recovery cannot revive a session", async () => {
  const a = await registration("Stale.Login"); let release!: () => void, reached!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; }), ready = new Promise<void>(resolve => { reached = resolve; });
  const run = security.pool.run.bind(security.pool);
  vi.spyOn(security.pool, "run").mockImplementationOnce(async work => { const result = await run(work); reached(); await gate; return result; });
  const login = loginAccount(db, { username: "Stale.Login", password: old });
  const rejected = expect(login).rejects.toThrow("Username or password is incorrect.");
  await ready; await reset("Stale.Login", a.recoveryCode); release(); await rejected;
  expect(db.prepare("SELECT count(*) AS n FROM account_sessions WHERE revoked_at IS NULL").get()?.n).toBe(0);
});
it("recovery throttles are independent, expiring and bounded without consuming ordinary login allowance", async () => {
  const a = await registration("Throttle.Recovery"), start = Date.now();
  vi.spyOn(Date, "now").mockReturnValue(start);
  for (let i = 0; i < 5; i++) await expect(reset("Throttle.Recovery", "wrong")).rejects.toThrow(recoveryFailure);
  await expect(reset("Throttle.Recovery", a.recoveryCode)).rejects.toThrow(/15 minutes/);
  await loginAccount(db, { username: "Throttle.Recovery", password: old });
  vi.spyOn(Date, "now").mockReturnValue(start + 900001); await reset("Throttle.Recovery", a.recoveryCode);
  security.recoveryTotal.clear("all"); for (let i = 0; i < 30; i++) security.recoveryTotal.take("all", start);
  vi.spyOn(Date, "now").mockReturnValue(start); await expect(reset("Another.Name", "wrong")).rejects.toThrow(/15 minutes/);
});
