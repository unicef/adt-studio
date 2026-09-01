CREATE TABLE IF NOT EXISTS publications (
  token TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  book_label TEXT NOT NULL,
  current_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  expires_at TEXT,
  revoked_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_publications_book_label ON publications (book_label);

CREATE TABLE IF NOT EXISTS versions (
  token TEXT NOT NULL REFERENCES publications (token) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  page_manifest TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (token, version)
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  token TEXT NOT NULL REFERENCES publications (token) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  is_author INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions (token);

CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  token TEXT NOT NULL REFERENCES publications (token) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  page_section_id TEXT NOT NULL,
  parent_id TEXT REFERENCES comments (id) ON DELETE CASCADE,
  session_id TEXT NOT NULL REFERENCES sessions (id),
  body TEXT NOT NULL,
  anchor TEXT,
  resolved_at TEXT,
  edited_at TEXT,
  deleted_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_comments_token_page ON comments (token, page_section_id);

CREATE INDEX IF NOT EXISTS idx_comments_token_created ON comments (token, created_at);

CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments (parent_id);
