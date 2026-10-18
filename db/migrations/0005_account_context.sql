ALTER TABLE account_sessions ADD COLUMN selected_group_id TEXT REFERENCES groups(id);
ALTER TABLE account_sessions ADD COLUMN context_revision INTEGER NOT NULL DEFAULT 0 CHECK(context_revision BETWEEN 0 AND 9007199254740990);
ALTER TABLE group_sessions ADD COLUMN context_revision INTEGER NOT NULL DEFAULT 0 CHECK(context_revision BETWEEN 0 AND 9007199254740990);
CREATE TRIGGER account_context_monotonic BEFORE UPDATE OF context_revision ON account_sessions
WHEN NEW.context_revision <= OLD.context_revision
BEGIN SELECT RAISE(ABORT, 'Context revision must increase'); END;
CREATE TRIGGER legacy_context_monotonic BEFORE UPDATE OF context_revision ON group_sessions
WHEN NEW.context_revision <= OLD.context_revision
BEGIN SELECT RAISE(ABORT, 'Context revision must increase'); END;
CREATE TABLE pending_group_invitations (
  intent_hash TEXT PRIMARY KEY CHECK(length(intent_hash)=64 AND intent_hash NOT GLOB '*[^0-9a-f]*'),
  invitation_id TEXT NOT NULL REFERENCES invitations(id),
  expires_at INTEGER NOT NULL CHECK(expires_at>=0)
) STRICT;
CREATE INDEX pending_group_invitations_expiry ON pending_group_invitations(expires_at);
