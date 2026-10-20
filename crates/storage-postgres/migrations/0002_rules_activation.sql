ALTER TABLE universes ADD COLUMN rules_revision bigint NOT NULL DEFAULT 0 CHECK (rules_revision >= 0);
CREATE TABLE rules_activations (
    universe uuid NOT NULL REFERENCES universes,
    revision bigint NOT NULL CHECK (revision > 0),
    previous_hash text NOT NULL REFERENCES rulesets,
    next_hash text NOT NULL REFERENCES rulesets,
    effective_at bigint NOT NULL,
    sequence bigint NOT NULL,
    PRIMARY KEY (universe, revision),
    UNIQUE (universe, sequence)
);
