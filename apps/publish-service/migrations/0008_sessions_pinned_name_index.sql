-- Both statements are safe to re-run: the UPDATE only ever touches rows it has already made
-- correct (WHERE name_key IS NULL), and CREATE UNIQUE INDEX IF NOT EXISTS is a no-op once it
-- exists. Unlike 0006/0007 this file may follow anything, including itself.
--
-- Backfill for rows written before the app started maintaining `name_key` on every insert and
-- rename (migration 0007). SQLite's own `lower(trim(name))` is an approximation — not the
-- Unicode-aware `nameKey()` the app uses — but it is only seeding history, and every row written
-- from here on gets an exact key from the app itself.
UPDATE sessions SET name_key = lower(trim(name)) WHERE name_key IS NULL;

-- At most one pinned session per (token, normalized name).
--
-- `sessions.ts`'s `pinnedHolderOf` already refuses a colliding name before the app writes
-- anything — but that is a read, and later a separate write, and two requests claiming the same
-- name and PIN can both pass the read before either has written. Only pinned rows collide (a PIN
-- is a lookup key; two people can still both be "Maria" as long as neither has claimed the name
-- with a PIN — see sessions.ts for why pinless names stopped reserving in M3.5), which is what
-- the partial `WHERE pin IS NOT NULL` encodes: this index is silent on every pinless row.
--
-- The loser of the race gets a UNIQUE constraint failure from D1 instead of a second identity
-- silently sharing a claimed name; d1-store.ts turns that failure into the same "name taken"
-- response the read-based check produces for the non-racing case.
--
-- If a deployment already holds duplicates from the pre-index race, CREATE UNIQUE INDEX fails
-- and the install-update surfaces it — loudly, at migration time, rather than silently keeping
-- both identities. Accepted: the window required the exact race this index closes.
CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_pinned_name_key
  ON sessions (token, name_key)
  WHERE pin IS NOT NULL;
