-- One statement, same reason as 0002: `ALTER TABLE ADD COLUMN` has no IF NOT EXISTS form, so a
-- file that mixes it with anything else cannot be re-run after a partial failure. The format is
-- `pbkdf2-sha256$<iterations>$<salt>$<hash>` — the same packed shape as `sessions.pin`. NULL means
-- the publication has no access code, which is exactly what every row written before M3.5 gets,
-- so those links keep opening on the token alone.
ALTER TABLE publications ADD COLUMN access_code TEXT;
