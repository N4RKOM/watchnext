PRAGMA defer_foreign_keys = ON;
DROP TRIGGER timestamp_insert;
DROP TRIGGER timestamp_update;
CREATE TABLE titles_replacement (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id),
  title TEXT CHECK(length(trim(title)) BETWEEN 1 AND 200 AND instr(title, char(0)) = 0),
  title_key TEXT CHECK(length(title_key) > 0),
  content_type TEXT CHECK(content_type IN ('movie', 'series', 'anime', 'youtube')),
  duration_seconds INTEGER CHECK(duration_seconds BETWEEN 1 AND 86400),
  numbering_style TEXT NOT NULL CHECK(numbering_style IN ('none', 'season_episode', 'continuous')),
  provider_namespace TEXT,
  provider_id TEXT,
  source_url TEXT,
  watch_url TEXT,
  cover_url TEXT,
  metadata_unavailable INTEGER NOT NULL DEFAULT 0 CHECK(metadata_unavailable IN (0,1)),
  archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK((title IS NOT NULL AND title_key IS NOT NULL AND content_type IS NOT NULL AND duration_seconds IS NOT NULL) OR (metadata_unavailable=1 AND provider_namespace IS NOT NULL)),
  CHECK((content_type IN ('movie', 'youtube') AND numbering_style = 'none') OR
        (content_type IN ('series', 'anime') AND numbering_style IN ('season_episode', 'continuous'))),
  CHECK((provider_namespace IS NULL AND provider_id IS NULL) OR
        (provider_namespace IS NOT NULL AND length(trim(provider_namespace)) > 0 AND
         provider_id IS NOT NULL AND length(trim(provider_id)) > 0)),
  UNIQUE(group_id, content_type, title_key),
  UNIQUE(group_id, provider_namespace, provider_id),
  UNIQUE(id, group_id),
  UNIQUE(id, group_id, numbering_style)
) STRICT;


INSERT INTO titles_replacement(id,group_id,title,title_key,content_type,duration_seconds,numbering_style,provider_namespace,provider_id,source_url,watch_url,cover_url,archived,created_at) SELECT id,group_id,title,title_key,content_type,duration_seconds,numbering_style,provider_namespace,provider_id,source_url,watch_url,cover_url,archived,created_at FROM titles;
DROP TABLE titles;
ALTER TABLE titles_replacement RENAME TO titles;
CREATE INDEX titles_active ON titles(group_id,archived);
CREATE TRIGGER timestamp_insert BEFORE INSERT ON progress
WHEN NEW.timestamp_seconds > (SELECT duration_seconds FROM titles WHERE id = NEW.title_id)
BEGIN SELECT RAISE(ABORT, 'Timestamp exceeds current duration'); END;

CREATE TRIGGER timestamp_update BEFORE UPDATE OF timestamp_seconds, title_id ON progress
WHEN NEW.timestamp_seconds > (SELECT duration_seconds FROM titles WHERE id = NEW.title_id)
BEGIN SELECT RAISE(ABORT, 'Timestamp exceeds current duration'); END;

CREATE TRIGGER protect_history_type BEFORE UPDATE OF content_type, numbering_style ON titles
WHEN (OLD.content_type <> NEW.content_type OR OLD.numbering_style <> NEW.numbering_style) AND
     (EXISTS(SELECT 1 FROM progress WHERE title_id = OLD.id) OR
      EXISTS(SELECT 1 FROM ratings WHERE title_id = OLD.id) OR
      EXISTS(SELECT 1 FROM notes WHERE title_id = OLD.id))
BEGIN SELECT RAISE(ABORT, 'Cannot change content type or numbering with member history'); END;

CREATE TABLE metadata_fields (
 title_id TEXT NOT NULL REFERENCES titles(id),
 field TEXT NOT NULL CHECK(field IN ('title','contentType','duration','genres','sourceUrl','watchUrl','coverUrl')),
 origin TEXT NOT NULL CHECK(origin IN ('provider','user')),
 cleared INTEGER NOT NULL DEFAULT 0 CHECK(cleared IN (0,1)),
 retrieved_at TEXT, expires_at TEXT,
 CHECK(origin='user' OR (retrieved_at IS NOT NULL AND expires_at IS NOT NULL)),
 PRIMARY KEY(title_id,field)
) STRICT;
CREATE INDEX metadata_expiry ON metadata_fields(origin,expires_at);
CREATE TABLE metadata_reviews (
 handle_hash TEXT PRIMARY KEY, group_id TEXT NOT NULL REFERENCES groups(id), member_id TEXT NOT NULL, session_id TEXT NOT NULL,
 expires_at TEXT NOT NULL, payload TEXT NOT NULL,
 FOREIGN KEY(member_id,group_id) REFERENCES members(id,group_id)
) STRICT;
CREATE INDEX metadata_review_expiry ON metadata_reviews(expires_at);

-- Rebuilding a referenced table leaves SQLite's deferred DROP counter pending.
-- Check every actual reference before resetting that counter; foreign_keys stays ON.
CREATE TEMP TABLE metadata_fk_assertion(ok INTEGER CHECK(ok=1));
INSERT INTO metadata_fk_assertion SELECT NOT EXISTS(SELECT 1 FROM pragma_foreign_key_check);
DROP TABLE metadata_fk_assertion;
PRAGMA defer_foreign_keys = OFF;
