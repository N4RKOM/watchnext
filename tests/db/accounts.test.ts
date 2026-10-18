// @vitest-environment node
import { DatabaseSync } from "node:sqlite";
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { migrate, migrationDirectory } from "../../db/migrate";

let root: string, db: DatabaseSync;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), "watchnext-account-schema-")); db = new DatabaseSync(join(root, "fixture.sqlite")); });
afterEach(() => {
  db.close();
  if (dirname(resolve(root)) !== resolve(tmpdir()) || !basename(root).startsWith("watchnext-account-schema-")) throw new Error("Unsafe fixture cleanup");
  rmSync(root, { recursive: true, force: true });
});
const run = (sql: string, ...values: (string | number | null)[]) => db.prepare(sql).run(...values);
// Synthetic digests only: these fixtures do not hash or accept a real credential.
function account(id: string, username = id) {
  run(`INSERT INTO accounts(id,username,username_key,password_version,password_algorithm,password_hash,password_salt,
    password_n,password_r,password_p,password_maxmem,recovery_digest) VALUES (?,?,?,1,'scrypt',?,?,131072,8,1,268435456,?)`,
    id, username, username.toLowerCase(), "a".repeat(128), "b".repeat(32), "c".repeat(64));
}
function member(id: string, group: string) {
  run("INSERT INTO members(id,group_id,name,name_key,avatar_color) VALUES (?,?,?,?,?)", id, group, id, id, "#1d4ed8");
}
function membership(accountId: string, group: string, memberId: string) {
  run("INSERT INTO account_memberships(account_id,group_id,member_id,joined_invite_generation) VALUES (?,?,?,1)", accountId, group, memberId);
}
function setup() {
  migrate(db); account("owner"); account("guest"); account("third");
  run("INSERT INTO groups(id,name,access_mode,owner_account_id) VALUES ('auth','Account group','account','owner'),('other','Other','account','owner')");
  run("INSERT INTO groups(id,name) VALUES ('legacy','Legacy')");
  member("own", "auth"); member("mem", "auth"); member("else", "other"); member("old", "legacy");
  membership("owner", "auth", "own"); membership("guest", "auth", "mem");
}
function oldMigrationFiles() {
  const path = join(root, "migrations");
  // cpSync creates the new parent, without copying any normal database.
  for (const name of readdirSync(migrationDirectory).filter(name => /^000[1-3]_/.test(name))) cpSync(join(migrationDirectory, name), join(path, name), { recursive: true });
  return path;
}
function snapshotOriginal() {
  return Object.fromEntries(db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name <> 'schema_migrations' ORDER BY name").all()
    .map(row => [row.name as string, db.prepare(`SELECT * FROM "${row.name}" ORDER BY rowid`).all()]));
}

it("upgrades populated legacy data without changing a single original column, row, ID or ledger record", () => {
  const files = oldMigrationFiles(); migrate(db, files);
  db.exec(`INSERT INTO groups(id,name) VALUES ('legacy','Original legacy'),('empty','Empty legacy');
    INSERT INTO invitations(id,group_id,token_hash,revoked_at) VALUES ('invite','legacy','synthetic-old-hash','2026-10-01');
    INSERT INTO members(id,group_id,name,name_key,avatar_color) VALUES ('old','legacy','Original Name','original name','#1d4ed8');
    INSERT INTO group_sessions(token_hash,group_id,invitation_id,active_member_id) VALUES ('${"d".repeat(64)}','legacy','invite','old');
    INSERT INTO titles(id,group_id,title,title_key,content_type,duration_seconds,numbering_style,provider_namespace,provider_id,archived)
      VALUES ('title','legacy','Original','original','youtube',1440,'none','youtube','Synthetic01',1);
    INSERT INTO contributors(group_id,title_id,member_id) VALUES ('legacy','title','old');
    INSERT INTO title_moods VALUES ('title','funny'); INSERT INTO title_genres VALUES ('title','comedy','Comedy');
    INSERT INTO progress(group_id,title_id,member_id,numbering_style,timestamp_seconds,completed) VALUES ('legacy','title','old','none',7,1);
    INSERT INTO ratings VALUES ('legacy','title','old',8); INSERT INTO notes VALUES ('legacy','title','old','Original note');
    INSERT INTO metadata_fields(title_id,field,origin,retrieved_at,expires_at) VALUES ('title','duration','provider','2026-10-01','2026-10-31');
    INSERT INTO metadata_reviews(handle_hash,group_id,member_id,session_id,expires_at,payload)
      VALUES ('synthetic-review-hash','legacy','old','synthetic-session-binding','2026-10-31','{"synthetic":true}');`);
  // Actual lifecycle rows, including an expirable provider field and a pending review.
  const tables = snapshotOriginal();
  const ledger = db.prepare("SELECT * FROM schema_migrations ORDER BY version").all();
  cpSync(join(migrationDirectory, "0004_accounts_memberships.sql"), join(files, "0004_accounts_memberships.sql"));
  expect(migrate(db, files)).toEqual(["0004_accounts_memberships.sql"]);
  for (const [table, rows] of Object.entries(tables)) {
    const columns = db.prepare(`PRAGMA table_info("${table}")`).all().map(row => row.name as string)
      .filter(name => !((table === "groups" && ["access_mode", "owner_account_id", "invite_generation"].includes(name)) || (table === "invitations" && name === "generation")));
    expect(db.prepare(`SELECT ${columns.map(name => `"${name}"`).join(",")} FROM "${table}" ORDER BY rowid`).all()).toEqual(rows);
  }
  expect(db.prepare("SELECT * FROM schema_migrations ORDER BY version LIMIT 3").all()).toEqual(ledger);
  expect(db.prepare("SELECT access_mode,owner_account_id FROM groups").all()).toEqual([
    { access_mode: "legacy", owner_account_id: null }, { access_mode: "legacy", owner_account_id: null },
  ]);
  expect(db.prepare("SELECT * FROM accounts").all()).toEqual([]);
  expect(db.prepare("SELECT * FROM account_memberships").all()).toEqual([]);
  expect(migrate(db, files)).toEqual([]); expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
});

it("fails an additive upgrade atomically then safely retries, leaving old data and history intact", () => {
  const files = oldMigrationFiles(); migrate(db, files); run("INSERT INTO groups(id,name) VALUES ('old','Preserved')");
  const before = snapshotOriginal(), ledger = db.prepare("SELECT * FROM schema_migrations").all();
  const next = join(files, "0004_accounts_memberships.sql"), sql = readFileSync(join(migrationDirectory, "0004_accounts_memberships.sql"), "utf8");
  writeFileSync(next, sql + "\nINVALID SQL;"); expect(() => migrate(db, files)).toThrow();
  expect(snapshotOriginal()).toEqual(before); expect(db.prepare("SELECT * FROM schema_migrations").all()).toEqual(ledger);
  expect(db.prepare("PRAGMA table_info(groups)").all().some(row => row.name === "access_mode")).toBe(false);
  writeFileSync(next, sql); expect(migrate(db, files)).toEqual(["0004_accounts_memberships.sql"]);
});

it("enforces normalized usernames and only versioned digest/salt/parameters, never credential defaults", () => {
  migrate(db); account("first", "Case.Name");
  expect(() => account("second", "case.name")).toThrow(/UNIQUE/);
  for (const username of ["ab", " bad", "naïve", "a".repeat(33), "space name", "valid\0suffix"]) expect(() => account("invalid", username)).toThrow();
  for (const [field, value] of [["username_key", "CASE.NAME"], ["password_version", 2], ["password_algorithm", "plain"], ["password_hash", "secret"], ["password_salt", ""], ["password_n", 12345], ["password_r", 0], ["password_p", 0], ["password_maxmem", 1], ["recovery_digest", "raw recovery"]] as const)
    expect(() => run(`UPDATE accounts SET ${field}=? WHERE id='first'`, value)).toThrow();
  expect(() => run("INSERT INTO accounts(id,username,username_key) VALUES ('raw','Raw','raw')")).toThrow();
  expect(() => run("UPDATE accounts SET password_hash=?", "a".repeat(128) + "\0raw")).toThrow();
  expect(db.prepare("SELECT password_hash,recovery_digest FROM accounts").get()).toEqual({ password_hash: "a".repeat(128), recovery_digest: "c".repeat(64) });
});

it("keeps account sessions separate, bound to real accounts, expiring/revocable and hashed only", () => {
  migrate(db); account("owner");
  run("INSERT INTO account_sessions(token_hash,account_id,created_at,expires_at) VALUES (?,'owner',100,200)", "e".repeat(64));
  for (const [hash, accountId, start, end] of [["raw", "owner", 100, 200], ["f".repeat(64), "missing", 100, 200], ["f".repeat(64), "owner", 100, 100]] as const)
    expect(() => run("INSERT INTO account_sessions(token_hash,account_id,created_at,expires_at) VALUES (?,?,?,?)", hash, accountId, start, end)).toThrow();
  expect(() => run("UPDATE account_sessions SET revoked_at=99")).toThrow();
  run("UPDATE account_sessions SET revoked_at=150");
  expect(db.prepare("SELECT expires_at,revoked_at FROM account_sessions").get()).toEqual({ expires_at: 200, revoked_at: 150 });
  expect(() => run("DELETE FROM accounts WHERE id='owner'")).toThrow();
});

it("rejects cross-mode, orphan, duplicate and wrong-group ownership including updates", () => {
  setup();
  for (const values of [["third", "legacy", "old"], ["missing", "other", "else"], ["third", "auth", "else"], ["guest", "auth", "own"], ["third", "auth", "mem"], ["third", "missing", "old"]])
    expect(() => membership(...values as [string, string, string])).toThrow();
  membership("guest", "other", "else");
  expect(() => run("INSERT INTO groups(id,name,access_mode,owner_account_id) VALUES ('bad','Bad','account','missing')")).toThrow();
  expect(() => run("INSERT INTO groups(id,name,access_mode) VALUES ('bad','Bad','account')")).toThrow();
  expect(() => run("UPDATE groups SET access_mode='account',owner_account_id='owner' WHERE id='legacy'")).toThrow();
  expect(() => run("UPDATE groups SET owner_account_id='guest' WHERE id='auth'")).toThrow();
  expect(() => run("UPDATE account_memberships SET member_id='else' WHERE account_id='guest' AND group_id='auth'")).toThrow();
  run("INSERT INTO invitations(id,group_id,token_hash) VALUES ('ai','auth','synthetic-auth-hash'),('li','legacy','synthetic-legacy-hash')");
  expect(() => run("INSERT INTO group_sessions(token_hash,group_id,invitation_id,active_member_id) VALUES (?,'auth','ai','mem')", "d".repeat(64))).toThrow(/legacy/);
  run("INSERT INTO group_sessions(token_hash,group_id,invitation_id,active_member_id) VALUES (?,'legacy','li','old')", "d".repeat(64));
  expect(() => run("UPDATE group_sessions SET group_id='auth',invitation_id='ai',active_member_id='mem'")).toThrow(/legacy/);
  expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
});

it("removal retains every history/contribution and stable identity; only a newer generation can reactivate", () => {
  setup();
  db.exec(`INSERT INTO titles(id,group_id,title,title_key,content_type,duration_seconds,numbering_style) VALUES ('t','auth','Film','film','movie',100,'none');
    INSERT INTO contributors(group_id,title_id,member_id) VALUES ('auth','t','mem');
    INSERT INTO progress(group_id,title_id,member_id,numbering_style,timestamp_seconds) VALUES ('auth','t','mem','none',9);
    INSERT INTO ratings VALUES ('auth','t','mem',8); INSERT INTO notes VALUES ('auth','t','mem','Keep me');`);
  const history = () => JSON.stringify(["members", "titles", "contributors", "progress", "ratings", "notes"].map(table => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()));
  const before = history();
  run("UPDATE account_memberships SET status='removed',removed_at='2026-10-18T00:00:00Z',removed_invite_generation=1 WHERE account_id='guest'");
  expect(history()).toBe(before);
  expect(() => run("DELETE FROM account_memberships WHERE account_id='guest'")).toThrow();
  expect(() => run("UPDATE account_memberships SET status='active',removed_at=NULL,removed_invite_generation=NULL WHERE account_id='guest'")).toThrow(/newer/);
  expect(() => run("UPDATE account_memberships SET status='active',joined_invite_generation=2,removed_at=NULL,removed_invite_generation=NULL WHERE account_id='guest'")).toThrow(/generation/);
  run("UPDATE groups SET invite_generation=2 WHERE id='auth'");
  run("UPDATE account_memberships SET status='active',joined_invite_generation=2,removed_at=NULL,removed_invite_generation=NULL WHERE account_id='guest'");
  expect(history()).toBe(before);
  expect(() => run("UPDATE groups SET invite_generation=1 WHERE id='auth'")).toThrow();
  expect(() => run("UPDATE account_memberships SET status='removed',removed_at='now',removed_invite_generation=2 WHERE account_id='owner'")).toThrow();
});

it("two connections serialize conflicting account/membership creation and failed transactions leave no partial state", () => {
  setup(); const other = new DatabaseSync(join(root, "fixture.sqlite"));
  other.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=1");
  try {
    db.exec("BEGIN IMMEDIATE"); account("racer");
    expect(() => other.exec("BEGIN IMMEDIATE")).toThrow(/locked/);
    db.exec("COMMIT");
    expect(() => other.exec("INSERT INTO accounts SELECT 'duplicate',username,username_key,password_version,password_algorithm,password_hash,password_salt,password_n,password_r,password_p,password_maxmem,recovery_digest,created_at FROM accounts WHERE id='racer'")).toThrow(/UNIQUE/);
    db.exec("BEGIN IMMEDIATE"); account("rollback");
    run("INSERT INTO groups(id,name,access_mode,owner_account_id) VALUES ('rollback-group','Temporary','account','rollback')"); member("rollback-member", "rollback-group");
    expect(() => membership("rollback", "rollback-group", "old")).toThrow(); db.exec("ROLLBACK");
    for (const [table, key] of [["accounts", "rollback"], ["groups", "rollback-group"], ["members", "rollback-member"]])
      expect(db.prepare(`SELECT * FROM ${table} WHERE id=?`).all(key)).toEqual([]);
    other.exec("BEGIN IMMEDIATE");
    expect(() => other.exec("INSERT INTO account_memberships(account_id,group_id,member_id,joined_invite_generation) VALUES ('guest','auth','mem',1)")).toThrow(/UNIQUE/);
    other.exec("ROLLBACK"); expect(db.prepare("SELECT count(*) AS n FROM account_memberships WHERE group_id='auth'").get()?.n).toBe(2);
    other.exec("BEGIN IMMEDIATE");
    other.exec("INSERT INTO groups(id,name,access_mode,owner_account_id) VALUES ('loser-group','Rolled back','account','third'); INSERT INTO members(id,group_id,name,name_key,avatar_color) VALUES ('loser-member','loser-group','Loser','loser','#1d4ed8')");
    expect(() => other.exec("INSERT INTO account_memberships(account_id,group_id,member_id,joined_invite_generation) VALUES ('guest','auth','mem',1)")).toThrow(/UNIQUE/);
    other.exec("ROLLBACK");
    expect(db.prepare("SELECT * FROM groups WHERE id='loser-group'").all()).toEqual([]);
    expect(db.prepare("SELECT * FROM members WHERE id='loser-member'").all()).toEqual([]);
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  } finally { other.close(); }
});
