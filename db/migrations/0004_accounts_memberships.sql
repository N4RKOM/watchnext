CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL CHECK(length(username) BETWEEN 3 AND 32 AND instr(username,char(0)) = 0 AND username NOT GLOB '*[^A-Za-z0-9_.-]*'),
  username_key TEXT NOT NULL UNIQUE CHECK(username_key = lower(username) AND length(username_key) BETWEEN 3 AND 32),
  password_version INTEGER NOT NULL CHECK(password_version = 1),
  password_algorithm TEXT NOT NULL CHECK(password_algorithm = 'scrypt'),
  password_hash TEXT NOT NULL CHECK(length(password_hash) = 128 AND instr(password_hash,char(0)) = 0 AND password_hash NOT GLOB '*[^0-9a-f]*'),
  password_salt TEXT NOT NULL CHECK(length(password_salt) = 32 AND instr(password_salt,char(0)) = 0 AND password_salt NOT GLOB '*[^0-9a-f]*'),
  password_n INTEGER NOT NULL CHECK(password_n BETWEEN 16384 AND 1048576 AND (password_n & (password_n - 1)) = 0),
  password_r INTEGER NOT NULL CHECK(password_r BETWEEN 1 AND 32),
  password_p INTEGER NOT NULL CHECK(password_p BETWEEN 1 AND 16),
  password_maxmem INTEGER NOT NULL CHECK(password_maxmem BETWEEN 16777216 AND 2147483647),
  recovery_digest TEXT NOT NULL CHECK(length(recovery_digest) = 64 AND instr(recovery_digest,char(0)) = 0 AND recovery_digest NOT GLOB '*[^0-9a-f]*'),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE TABLE account_sessions (
  token_hash TEXT PRIMARY KEY CHECK(length(token_hash) = 64 AND instr(token_hash,char(0)) = 0 AND token_hash NOT GLOB '*[^0-9a-f]*'),
  account_id TEXT NOT NULL REFERENCES accounts(id),
  created_at INTEGER NOT NULL CHECK(created_at >= 0),
  expires_at INTEGER NOT NULL CHECK(expires_at > created_at),
  revoked_at INTEGER CHECK(revoked_at >= created_at)
) STRICT;
CREATE INDEX account_sessions_account ON account_sessions(account_id, expires_at);

ALTER TABLE groups ADD COLUMN access_mode TEXT NOT NULL DEFAULT 'legacy' CHECK(access_mode IN ('legacy', 'account'));
ALTER TABLE groups ADD COLUMN owner_account_id TEXT REFERENCES accounts(id)
  CHECK((access_mode = 'legacy' AND owner_account_id IS NULL) OR (access_mode = 'account' AND owner_account_id IS NOT NULL));
ALTER TABLE groups ADD COLUMN invite_generation INTEGER NOT NULL DEFAULT 1 CHECK(invite_generation BETWEEN 1 AND 2147483647);
CREATE UNIQUE INDEX groups_id_mode ON groups(id, access_mode);
ALTER TABLE invitations ADD COLUMN generation INTEGER NOT NULL DEFAULT 1 CHECK(generation BETWEEN 1 AND 2147483647);

-- Mode/ownership is chosen once at INSERT. Legacy identities cannot be claimed.
CREATE TRIGGER group_access_immutable BEFORE UPDATE OF access_mode, owner_account_id ON groups
WHEN NEW.access_mode <> OLD.access_mode OR NEW.owner_account_id IS NOT OLD.owner_account_id
BEGIN SELECT RAISE(ABORT, 'Group access mode and ownership are immutable'); END;
CREATE TRIGGER group_generation_monotonic BEFORE UPDATE OF invite_generation ON groups
WHEN NEW.invite_generation < OLD.invite_generation
BEGIN SELECT RAISE(ABORT, 'Invite generation cannot decrease'); END;

CREATE TABLE account_memberships (
  account_id TEXT NOT NULL REFERENCES accounts(id),
  group_id TEXT NOT NULL,
  group_mode TEXT NOT NULL DEFAULT 'account' CHECK(group_mode = 'account'),
  member_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'removed')),
  joined_invite_generation INTEGER NOT NULL CHECK(joined_invite_generation BETWEEN 1 AND 2147483647),
  removed_invite_generation INTEGER CHECK(removed_invite_generation BETWEEN 1 AND 2147483647),
  removed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY(account_id, group_id),
  FOREIGN KEY(group_id, group_mode) REFERENCES groups(id, access_mode),
  FOREIGN KEY(member_id, group_id) REFERENCES members(id, group_id),
  CHECK((status = 'active' AND removed_at IS NULL AND removed_invite_generation IS NULL) OR
        (status = 'removed' AND removed_at IS NOT NULL AND removed_invite_generation IS NOT NULL AND
         removed_invite_generation >= joined_invite_generation))
) STRICT;
CREATE INDEX account_memberships_live ON account_memberships(group_id, status, account_id);

CREATE TRIGGER membership_generation_insert BEFORE INSERT ON account_memberships
WHEN NEW.joined_invite_generation > (SELECT invite_generation FROM groups WHERE id = NEW.group_id)
  OR NEW.removed_invite_generation > (SELECT invite_generation FROM groups WHERE id = NEW.group_id)
BEGIN SELECT RAISE(ABORT, 'Membership generation exceeds current invite generation'); END;
CREATE TRIGGER membership_generation_update BEFORE UPDATE ON account_memberships
WHEN NEW.joined_invite_generation > (SELECT invite_generation FROM groups WHERE id = NEW.group_id)
  OR NEW.removed_invite_generation > (SELECT invite_generation FROM groups WHERE id = NEW.group_id)
BEGIN SELECT RAISE(ABORT, 'Membership generation exceeds current invite generation'); END;

CREATE TRIGGER membership_identity_immutable BEFORE UPDATE OF account_id, group_id, group_mode, member_id ON account_memberships
WHEN NEW.account_id <> OLD.account_id OR NEW.group_id <> OLD.group_id OR NEW.group_mode <> OLD.group_mode OR NEW.member_id <> OLD.member_id
BEGIN SELECT RAISE(ABORT, 'Membership identity is immutable'); END;
CREATE TRIGGER membership_preserve BEFORE DELETE ON account_memberships
BEGIN SELECT RAISE(ABORT, 'Remove membership without deleting its identity'); END;
CREATE TRIGGER membership_owner_active_insert BEFORE INSERT ON account_memberships
WHEN NEW.status = 'removed' AND NEW.account_id = (SELECT owner_account_id FROM groups WHERE id = NEW.group_id)
BEGIN SELECT RAISE(ABORT, 'Group owner must remain active'); END;
CREATE TRIGGER membership_owner_active_update BEFORE UPDATE OF status ON account_memberships
WHEN NEW.status = 'removed' AND NEW.account_id = (SELECT owner_account_id FROM groups WHERE id = NEW.group_id)
BEGIN SELECT RAISE(ABORT, 'Group owner must remain active'); END;
CREATE TRIGGER membership_rejoin_generation BEFORE UPDATE OF status, joined_invite_generation ON account_memberships
WHEN OLD.status = 'removed' AND NEW.status = 'active' AND NEW.joined_invite_generation <= OLD.removed_invite_generation
BEGIN SELECT RAISE(ABORT, 'Rejoin requires a newer invite generation'); END;

-- Legacy cookies must never point into an account-owned group.
CREATE TRIGGER group_session_legacy_insert BEFORE INSERT ON group_sessions
WHEN (SELECT access_mode FROM groups WHERE id = NEW.group_id) <> 'legacy'
BEGIN SELECT RAISE(ABORT, 'Legacy session requires a legacy group'); END;
CREATE TRIGGER group_session_legacy_update BEFORE UPDATE ON group_sessions
WHEN (SELECT access_mode FROM groups WHERE id = NEW.group_id) <> 'legacy'
BEGIN SELECT RAISE(ABORT, 'Legacy session requires a legacy group'); END;
