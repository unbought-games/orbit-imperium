ALTER TABLE universe_runtime ADD COLUMN executor_mode text NOT NULL DEFAULT 'serial'
    CHECK (executor_mode IN ('serial','preparing','scoped'));
ALTER TABLE universe_runtime ADD COLUMN mode_generation bigint NOT NULL DEFAULT 0 CHECK(mode_generation>=0);
ALTER TABLE universe_runtime ADD COLUMN ordering_floor bigint NOT NULL DEFAULT 0;
-- Logical time attached to the visible revision, not private dependency progress.
ALTER TABLE viewer_heads ADD COLUMN changed_at bigint;
ALTER TABLE viewer_heads ADD COLUMN changed_at_generation bigint NOT NULL DEFAULT 0 CHECK(changed_at_generation>=0);

CREATE TABLE execution_scopes (
    universe uuid NOT NULL REFERENCES universes ON DELETE CASCADE,
    key text NOT NULL,
    frontier bigint NOT NULL DEFAULT 0,
    fence bigint NOT NULL DEFAULT 0,
    claim_input uuid,
    claim_token uuid,
    claim_owner uuid,
    lease_until bigint,
    blocked text,
    resolved_at bigint,
    resolved_phase integer,
    resolved_ordinal bigint,
    PRIMARY KEY(universe,key),
    CHECK(num_nonnulls(claim_input,claim_token,claim_owner,lease_until) IN (0,4))
);
CREATE TABLE input_scopes (
    universe uuid NOT NULL,
    input_id uuid NOT NULL,
    scope_key text NOT NULL,
    PRIMARY KEY(universe,input_id,scope_key),
    FOREIGN KEY(universe,scope_key) REFERENCES execution_scopes(universe,key) ON DELETE CASCADE
);
CREATE INDEX input_scope_head ON input_scopes(universe,scope_key,input_id);
CREATE VIEW pending_inputs AS
    SELECT universe,input_id,input,at_ms,1 AS phase,sequence FROM commands WHERE NOT done
    UNION ALL
    SELECT universe,id AS input_id,input,at_ms,0 AS phase,sequence FROM scheduled_events WHERE NOT done AND NOT cancelled;
CREATE TABLE runtime_barriers (
    universe uuid NOT NULL REFERENCES universes ON DELETE CASCADE,
    id uuid PRIMARY KEY,
    at_ms bigint NOT NULL,
    sequence bigint NOT NULL,
    expected_revision bigint NOT NULL,
    rules jsonb NOT NULL,
    done boolean NOT NULL DEFAULT false,
    outcome jsonb
);
CREATE UNIQUE INDEX one_runtime_barrier ON runtime_barriers(universe) WHERE NOT done;

CREATE INDEX blocked_execution_scopes ON execution_scopes(universe) WHERE blocked IS NOT NULL;
