-- Dedicated read-only credentials, deliberately unrelated to player sessions/bot tokens.
CREATE TABLE tracker_tokens (
    digest text PRIMARY KEY,
    universe uuid NOT NULL REFERENCES universes ON DELETE CASCADE,
    epoch uuid NOT NULL,
    issued_at bigint NOT NULL,
    revoked_at bigint
);
CREATE INDEX tracker_tokens_universe ON tracker_tokens(universe);
