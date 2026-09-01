-- One packed column instead of hash + salt + params columns: `ALTER TABLE ADD COLUMN` has no
-- IF NOT EXISTS form, so a single statement is the only shape a half-applied migration can
-- recover from by re-running. The format is `pbkdf2-sha256$<iterations>$<salt>$<hash>`, which
-- also lets the iteration count move without a further migration.
ALTER TABLE sessions ADD COLUMN pin TEXT;
