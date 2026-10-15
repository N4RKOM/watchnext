CREATE TABLE groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 80),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE TABLE invitations (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id),
  token_hash TEXT NOT NULL UNIQUE CHECK(length(token_hash) > 0),
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE TABLE members (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id),
  name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 40 AND instr(name, char(0)) = 0),
  name_key TEXT NOT NULL CHECK(length(name_key) > 0),
  avatar_color TEXT NOT NULL CHECK(length(avatar_color) = 7 AND avatar_color GLOB '#[0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F]'),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(group_id, name_key),
  UNIQUE(id, group_id)
) STRICT;

CREATE TABLE titles (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id),
  title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 200 AND instr(title, char(0)) = 0),
  title_key TEXT NOT NULL CHECK(length(title_key) > 0),
  content_type TEXT NOT NULL CHECK(content_type IN ('movie', 'series', 'anime', 'youtube')),
  duration_seconds INTEGER NOT NULL CHECK(duration_seconds BETWEEN 1 AND 86400),
  numbering_style TEXT NOT NULL CHECK(numbering_style IN ('none', 'season_episode', 'continuous')),
  provider_namespace TEXT,
  provider_id TEXT,
  source_url TEXT,
  watch_url TEXT,
  cover_url TEXT,
  archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
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

CREATE INDEX titles_active ON titles(group_id, archived);

CREATE TABLE title_genres (
  title_id TEXT NOT NULL REFERENCES titles(id),
  genre_key TEXT NOT NULL CHECK(length(genre_key) > 0),
  label TEXT NOT NULL CHECK(length(trim(label)) BETWEEN 1 AND 40 AND instr(label, char(0)) = 0),
  PRIMARY KEY(title_id, genre_key)
) STRICT;

CREATE TRIGGER genre_limit BEFORE INSERT ON title_genres
WHEN (SELECT count(*) FROM title_genres WHERE title_id = NEW.title_id) >= 10
BEGIN SELECT RAISE(ABORT, 'At most ten genres per title'); END;

CREATE TRIGGER genre_limit_move BEFORE UPDATE OF title_id ON title_genres
WHEN OLD.title_id <> NEW.title_id AND
     (SELECT count(*) FROM title_genres WHERE title_id = NEW.title_id) >= 10
BEGIN SELECT RAISE(ABORT, 'At most ten genres per title'); END;

CREATE TABLE moods (
  code TEXT PRIMARY KEY CHECK(code IN ('funny', 'relaxing', 'exciting', 'dark', 'emotional')),
  label TEXT NOT NULL UNIQUE
) STRICT;

INSERT INTO moods(code, label) VALUES
  ('funny', 'Funny'), ('relaxing', 'Relaxing'), ('exciting', 'Exciting'),
  ('dark', 'Dark'), ('emotional', 'Emotional');

CREATE TABLE title_moods (
  title_id TEXT NOT NULL REFERENCES titles(id),
  mood_code TEXT NOT NULL REFERENCES moods(code),
  PRIMARY KEY(title_id, mood_code)
) STRICT;

CREATE TABLE contributors (
  group_id TEXT NOT NULL,
  title_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY(title_id, member_id),
  FOREIGN KEY(title_id, group_id) REFERENCES titles(id, group_id),
  FOREIGN KEY(member_id, group_id) REFERENCES members(id, group_id)
) STRICT;

CREATE TABLE progress (
  group_id TEXT NOT NULL,
  title_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  numbering_style TEXT NOT NULL,
  position_state TEXT NOT NULL DEFAULT 'unknown' CHECK(position_state IN ('unknown', 'not_started', 'in_progress')),
  next_season INTEGER,
  next_episode INTEGER,
  timestamp_seconds INTEGER CHECK(timestamp_seconds BETWEEN 0 AND 86400),
  completed INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0, 1)),
  PRIMARY KEY(title_id, member_id),
  FOREIGN KEY(title_id, group_id, numbering_style) REFERENCES titles(id, group_id, numbering_style),
  FOREIGN KEY(member_id, group_id) REFERENCES members(id, group_id),
  CHECK(next_season IS NULL OR next_season BETWEEN 1 AND 9999),
  CHECK(next_episode IS NULL OR next_episode BETWEEN 1 AND 9999),
  CHECK((numbering_style = 'none' AND next_season IS NULL AND next_episode IS NULL) OR
        (numbering_style IN ('season_episode', 'continuous') AND timestamp_seconds IS NULL AND
          ((position_state = 'unknown' AND next_season IS NULL AND next_episode IS NULL) OR
           (position_state IN ('not_started', 'in_progress') AND next_episode IS NOT NULL AND
             ((numbering_style = 'season_episode' AND next_season IS NOT NULL) OR
              (numbering_style = 'continuous' AND next_season IS NULL)) AND
             (position_state <> 'not_started' OR
               (next_episode = 1 AND (next_season IS NULL OR next_season = 1)))))))
) STRICT;

CREATE TRIGGER timestamp_insert BEFORE INSERT ON progress
WHEN NEW.timestamp_seconds > (SELECT duration_seconds FROM titles WHERE id = NEW.title_id)
BEGIN SELECT RAISE(ABORT, 'Timestamp exceeds current duration'); END;

CREATE TRIGGER timestamp_update BEFORE UPDATE OF timestamp_seconds, title_id ON progress
WHEN NEW.timestamp_seconds > (SELECT duration_seconds FROM titles WHERE id = NEW.title_id)
BEGIN SELECT RAISE(ABORT, 'Timestamp exceeds current duration'); END;

CREATE TABLE ratings (
  group_id TEXT NOT NULL,
  title_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  score INTEGER NOT NULL CHECK(score BETWEEN 1 AND 10),
  PRIMARY KEY(title_id, member_id),
  FOREIGN KEY(title_id, group_id) REFERENCES titles(id, group_id),
  FOREIGN KEY(member_id, group_id) REFERENCES members(id, group_id)
) STRICT;

CREATE TABLE notes (
  group_id TEXT NOT NULL,
  title_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  body TEXT NOT NULL CHECK(length(trim(body)) BETWEEN 1 AND 2000 AND instr(body, char(0)) = 0),
  PRIMARY KEY(title_id, member_id),
  FOREIGN KEY(title_id, group_id) REFERENCES titles(id, group_id),
  FOREIGN KEY(member_id, group_id) REFERENCES members(id, group_id)
) STRICT;

CREATE TRIGGER protect_history_type BEFORE UPDATE OF content_type, numbering_style ON titles
WHEN (OLD.content_type <> NEW.content_type OR OLD.numbering_style <> NEW.numbering_style) AND
     (EXISTS(SELECT 1 FROM progress WHERE title_id = OLD.id) OR
      EXISTS(SELECT 1 FROM ratings WHERE title_id = OLD.id) OR
      EXISTS(SELECT 1 FROM notes WHERE title_id = OLD.id))
BEGIN SELECT RAISE(ABORT, 'Cannot change content type or numbering with member history'); END;
