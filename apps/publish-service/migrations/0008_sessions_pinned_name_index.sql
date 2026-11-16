UPDATE sessions SET name_key = lower(trim(name)) WHERE name_key IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_pinned_name_key
  ON sessions (token, name_key) WHERE pin IS NOT NULL;
