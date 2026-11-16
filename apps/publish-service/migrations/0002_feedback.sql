CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  token TEXT NOT NULL REFERENCES publications (token) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  is_author INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  pin TEXT,
  name_key TEXT
);

CREATE INDEX idx_sessions_token ON sessions (token);

CREATE TABLE comments (
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

CREATE INDEX idx_comments_token_page ON comments (token, page_section_id);
CREATE INDEX idx_comments_token_created ON comments (token, created_at);
CREATE INDEX idx_comments_parent ON comments (parent_id);
