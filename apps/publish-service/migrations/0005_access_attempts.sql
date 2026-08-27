-- Failed attempts at the two doors that verify a short, human-typed secret:
-- POST /p/:token/access and POST /p/:token/session/claim. Both are
-- unauthenticated by construction, so without this the access code is only as
-- strong as the worker's willingness to keep answering.
--
-- Only failures are recorded. A success clears the caller's row, so an author
-- reading out a code to a room does not accumulate a lockout for anyone.
--
-- `client` is an HMAC of the caller's IP under MGMT_SECRET, never the address
-- itself: the counters need to tell callers apart, not to identify them, and a
-- reader list built from "who typed a name" would be a poor place to keep a
-- log of who tried and failed.
CREATE TABLE IF NOT EXISTS access_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT NOT NULL,
  client TEXT NOT NULL,
  at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_access_attempts_client ON access_attempts (client, at);
CREATE INDEX IF NOT EXISTS idx_access_attempts_token ON access_attempts (token, at);
