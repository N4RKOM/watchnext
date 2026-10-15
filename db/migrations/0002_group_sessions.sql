CREATE UNIQUE INDEX invitations_id_group ON invitations(id, group_id);

CREATE TABLE group_sessions (
  token_hash TEXT PRIMARY KEY CHECK(length(token_hash) = 64),
  group_id TEXT NOT NULL REFERENCES groups(id),
  invitation_id TEXT NOT NULL,
  active_member_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY(invitation_id, group_id) REFERENCES invitations(id, group_id),
  FOREIGN KEY(active_member_id, group_id) REFERENCES members(id, group_id)
) STRICT;
