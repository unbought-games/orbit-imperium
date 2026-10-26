-- Coordinated upgrade: stop all old processes before applying. No compatibility view.
ALTER TABLE universe_policies RENAME TO universe_policies_v2;
ALTER TABLE universe_policies_v2 ADD COLUMN bots jsonb NOT NULL DEFAULT '{"version":1,"enabled":false,"max_active":0,"action_units_per_24h":null}';
CREATE TABLE bot_participation (
    universe uuid NOT NULL REFERENCES universes,
    player uuid NOT NULL REFERENCES players,
    account uuid NOT NULL REFERENCES accounts,
    admitted_at bigint NOT NULL,
    admission_order bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
    sleep_start_utc_minute integer NOT NULL CHECK (sleep_start_utc_minute BETWEEN 0 AND 1439),
    retired_at bigint,
    retirement_reason text,
    PRIMARY KEY (universe,player),
    UNIQUE(universe,player,account),
    CHECK ((retired_at IS NULL) = (retirement_reason IS NULL))
);
CREATE TABLE bot_tokens (
    digest text PRIMARY KEY,
    universe uuid NOT NULL,
    player uuid NOT NULL,
    account uuid NOT NULL,
    issued_at bigint NOT NULL,
    revoked_at bigint,
    FOREIGN KEY(universe,player,account) REFERENCES bot_participation(universe,player,account)
);
CREATE TABLE bot_activity (
    universe uuid NOT NULL,
    player uuid NOT NULL,
    epoch uuid NOT NULL,
    category text NOT NULL,
    request_id uuid NOT NULL,
    at_ms bigint NOT NULL,
    PRIMARY KEY(universe,player,epoch,category,request_id),
    FOREIGN KEY(universe,player) REFERENCES bot_participation
);
CREATE INDEX bot_activity_window ON bot_activity(universe,player,at_ms);
CREATE TABLE bot_observations (
    universe uuid NOT NULL,
    player uuid NOT NULL,
    epoch uuid NOT NULL,
    request_id uuid NOT NULL,
    intent_hash text NOT NULL,
    response jsonb NOT NULL,
    PRIMARY KEY(universe,player,epoch,request_id),
    FOREIGN KEY(universe,player) REFERENCES bot_participation
);
CREATE TABLE bot_retirements (
    universe uuid NOT NULL,
    player uuid NOT NULL,
    retired_at bigint NOT NULL,
    reason text NOT NULL,
    policy_revision bigint,
    PRIMARY KEY(universe,player),
    FOREIGN KEY(universe,player) REFERENCES bot_participation
);

CREATE TABLE bot_social_receipts (LIKE bot_observations INCLUDING ALL);
