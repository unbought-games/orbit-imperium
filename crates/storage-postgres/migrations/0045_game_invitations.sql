-- Immutable game destination chosen by the authenticated inviter. Remote account
-- attribution remains separate. A nullable code is an idempotent in-flight issue.
CREATE TABLE game_invitations (
    issuer text NOT NULL,
    account uuid NOT NULL,
    operation_id text NOT NULL,
    code text UNIQUE,
    kind text NOT NULL CHECK(kind IN ('personal','combined','alliance_public')),
    alliance uuid,
    universe uuid NOT NULL,
    epoch uuid NOT NULL,
    player uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (issuer, account, operation_id),
    CHECK (length(operation_id) BETWEEN 1 AND 200),
    CHECK (code IS NULL OR length(code) BETWEEN 1 AND 200)
);
