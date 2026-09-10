CREATE TABLE publications (
  token TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  book_label TEXT NOT NULL,
  current_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  expires_at TEXT,
  revoked_at TEXT,
  access_code TEXT
);

CREATE INDEX idx_publications_book_label ON publications (book_label);

CREATE TABLE publication_uploads (
  upload_id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('create', 'version')),
  token TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  state TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'committed', 'aborted')),
  title TEXT,
  book_label TEXT,
  page_manifest TEXT NOT NULL,
  snapshot_prefix TEXT NOT NULL UNIQUE,
  snapshot_bytes INTEGER NOT NULL CHECK (snapshot_bytes > 0),
  expected_files INTEGER NOT NULL CHECK (expected_files > 0),
  expires_at TEXT,
  access_code TEXT,
  created_at TEXT NOT NULL,
  committed_at TEXT,
  committed_result TEXT
);

CREATE UNIQUE INDEX idx_publication_uploads_open_target
  ON publication_uploads (token, version) WHERE state = 'open';
CREATE INDEX idx_publication_uploads_token ON publication_uploads (token);

CREATE TABLE publication_upload_files (
  upload_id TEXT NOT NULL REFERENCES publication_uploads (upload_id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  bytes INTEGER NOT NULL CHECK (bytes >= 0),
  sha256 TEXT NOT NULL,
  completed_at TEXT,
  PRIMARY KEY (upload_id, path)
);

CREATE TABLE versions (
  token TEXT NOT NULL REFERENCES publications (token) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  page_manifest TEXT NOT NULL,
  created_at TEXT NOT NULL,
  snapshot_bytes INTEGER,
  snapshot_prefix TEXT,
  upload_id TEXT,
  PRIMARY KEY (token, version)
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  token TEXT NOT NULL REFERENCES publications (token) ON DELETE CASCADE,
  name TEXT NOT NULL,
  name_key TEXT,
  color TEXT NOT NULL,
  is_author INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  pin TEXT
);

CREATE INDEX idx_sessions_token ON sessions (token);
CREATE UNIQUE INDEX idx_sessions_pinned_name_key
  ON sessions (token, name_key) WHERE pin IS NOT NULL;

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

CREATE TABLE access_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT NOT NULL,
  client TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'access',
  at TEXT NOT NULL
);

CREATE INDEX idx_access_attempts_client ON access_attempts (client, at);
CREATE INDEX idx_access_attempts_token ON access_attempts (token, at);
