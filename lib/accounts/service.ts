import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
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

export const recoveryFailure = "The username or recovery code is incorrect or no longer valid.";
export async function recoverAccount(db: DatabaseSync, input: Record<string, unknown>, now = Math.floor(Date.now() / 1000)) {
  // Separate recovery admission, including malformed usernames/codes; cookies grant no proof.
  security.recoveryTotal.take("all");
  let key: string | undefined;
  try { key = usernameInput(input.username).key; } catch { /* Same safe proof error below. */ }
  security.recovery.take(key ?? "<invalid>");
  const row = key ? db.prepare("SELECT id,recovery_digest FROM accounts WHERE username_key=?").get(key) : undefined;
  const canonical = validCredential(input.recoveryCode);
  const actual = Buffer.from(credentialHash(canonical ? input.recoveryCode as string : ""), "hex");
  const supported = row && typeof row.recovery_digest === "string" && /^[0-9a-f]{64}$/.test(row.recovery_digest);
  const expected = Buffer.from(supported ? row.recovery_digest as string : "00".repeat(32), "hex");
  const proof = timingSafeEqual(actual, expected);
  if (!proof || !canonical || !supported) throw new AuthError(recoveryFailure);
  const password = passwordInput(input.password);
  if (input.confirmation !== password) throw new AuthError("The password confirmation must match exactly.");
  const record = await makePassword(password), recoveryCode = randomBytes(32).toString("base64url");
  db.exec("BEGIN IMMEDIATE");
  try {
    const changed = db.prepare(`UPDATE accounts SET password_version=1,password_algorithm='scrypt',password_hash=?,password_salt=?,
      password_n=?,password_r=?,password_p=?,password_maxmem=?,recovery_digest=? WHERE id=? AND recovery_digest=?`)
      .run(record.hash, record.salt, passwordParameters.N, passwordParameters.r, passwordParameters.p, passwordParameters.maxmem,
        credentialHash(recoveryCode), row.id as string, row.recovery_digest as string);
    if (changed.changes !== 1) throw new AuthError(recoveryFailure);
    db.prepare("UPDATE account_sessions SET revoked_at=max(created_at,?) WHERE account_id=? AND revoked_at IS NULL").run(now, row.id as string);
    db.exec("COMMIT"); security.recovery.clear(key!);
    return { recoveryCode };
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}
