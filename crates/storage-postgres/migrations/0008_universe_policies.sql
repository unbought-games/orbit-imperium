-- Additive preparation only: retained universes require an explicit reviewed import.
CREATE TABLE universe_policies (
    universe uuid PRIMARY KEY REFERENCES universes(id),
    revision bigint NOT NULL CHECK (revision >= 0),
    signup_enabled boolean NOT NULL,
    max_players integer CHECK (max_players >= 1),
    signup_per_minute integer NOT NULL CHECK (signup_per_minute BETWEEN 1 AND 10000),
    commands_per_minute integer NOT NULL CHECK (commands_per_minute BETWEEN 1 AND 10000)
);
CREATE TABLE universe_policy_changes (
    universe uuid NOT NULL REFERENCES universe_policies(universe),
    revision bigint NOT NULL CHECK (revision >= 0),
    previous_policy jsonb,
    next_policy jsonb NOT NULL,
    provenance text NOT NULL CHECK (provenance IN ('create', 'legacy_import', 'apply')),
    changed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (universe, revision),
    CHECK ((revision = 0 AND previous_policy IS NULL AND provenance IN ('create','legacy_import'))
        OR (revision > 0 AND previous_policy IS NOT NULL AND provenance = 'apply'))
);
