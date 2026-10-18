import { randomBytes, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { credentialHash, validCredential } from "../sessions";
import { AuthError, checkPassword, makePassword, passwordInput, passwordParameters, security, usernameInput } from "./security";

export const accountCookieName = "watchnext_account_session";
export const accountLifetime = 7 * 24 * 60 * 60;
export function accountCredential(header: string | null) {
  const matches = (header ?? "").split(";").map(part => part.trim()).filter(part => part.startsWith(accountCookieName + "="));
  return matches.length === 1 ? matches[0].slice(accountCookieName.length + 1) : undefined;
}
export function currentAccount(db: DatabaseSync, credential: unknown, now = Math.floor(Date.now() / 1000)) {
  if (!validCredential(credential)) return null;
  const row = db.prepare(`SELECT a.id,a.username FROM account_sessions s JOIN accounts a ON a.id=s.account_id
    WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>?`).get(credentialHash(credential), now);
  return row ? { id: row.id as string, username: row.username as string } : null;
}
function issueSession(db: DatabaseSync, accountId: string, previous: unknown, now: number) {
  const credential = randomBytes(32).toString("base64url");
  db.prepare("INSERT INTO account_sessions(token_hash,account_id,created_at,expires_at) VALUES (?,?,?,?)")
    .run(credentialHash(credential), accountId, now, now + accountLifetime);
  if (validCredential(previous)) db.prepare("UPDATE account_sessions SET revoked_at=max(created_at,?) WHERE token_hash=? AND revoked_at IS NULL").run(now, credentialHash(previous));
  return credential;
}
export async function registerAccount(db: DatabaseSync, input: Record<string, unknown>, previous?: unknown, now = Math.floor(Date.now() / 1000)) {
  const { username, key } = usernameInput(input.username), password = passwordInput(input.password);
  if (input.confirmation !== password) throw new AuthError("The password confirmation must match exactly.");
  security.signup.take(key); security.signupTotal.take("all");
  const passwordRecord = await makePassword(password), recoveryCode = randomBytes(32).toString("base64url"), id = randomUUID();
  db.exec("BEGIN IMMEDIATE");
  try {
    if (db.prepare("SELECT id FROM accounts WHERE username_key=?").get(key)) throw new AuthError("That username is already taken. Choose another.");
    db.prepare(`INSERT INTO accounts(id,username,username_key,password_version,password_algorithm,password_hash,password_salt,
      password_n,password_r,password_p,password_maxmem,recovery_digest) VALUES (?,?,?,1,'scrypt',?,?,?,?,?,?,?)`)
      .run(id, username, key, passwordRecord.hash, passwordRecord.salt, passwordParameters.N, passwordParameters.r, passwordParameters.p, passwordParameters.maxmem, credentialHash(recoveryCode));
    const credential = issueSession(db, id, previous, now);
    db.exec("COMMIT"); return { credential, recoveryCode, username };
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}
export async function loginAccount(db: DatabaseSync, input: Record<string, unknown>, previous?: unknown, now = Math.floor(Date.now() / 1000)) {
  const { key } = usernameInput(input.username), password = passwordInput(input.password);
  security.login.take(key);
  const row = db.prepare("SELECT * FROM accounts WHERE username_key=?").get(key);
  if (!await checkPassword(password, row)) throw new AuthError("Username or password is incorrect.");
  db.exec("BEGIN IMMEDIATE");
  try {
    // Credential changes during asynchronous work must not revive a stale password.
    const current = db.prepare("SELECT password_hash,password_salt FROM accounts WHERE id=?").get(row!.id as string);
    if (!current || current.password_hash !== row!.password_hash || current.password_salt !== row!.password_salt) throw new AuthError("Username or password is incorrect.");
    const credential = issueSession(db, row!.id as string, previous, now);
    db.exec("COMMIT"); security.login.clear(key); return { credential };
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}
export function logoutAccount(db: DatabaseSync, credential: unknown, now = Math.floor(Date.now() / 1000)) {
  if (validCredential(credential)) db.prepare("UPDATE account_sessions SET revoked_at=max(created_at,?) WHERE token_hash=? AND revoked_at IS NULL").run(now, credentialHash(credential));
}
