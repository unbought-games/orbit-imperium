-- No production enrollment: empty until an upgraded, ordered consumer explicitly binds a run.
-- Receipts and evidence are immutable source facts in the pinned run, retained after empire deletion.
CREATE TABLE objective_runs (
    id uuid PRIMARY KEY,
    universe uuid NOT NULL REFERENCES universes(id) ON DELETE CASCADE,
    epoch uuid NOT NULL,
    beneficiary uuid NOT NULL,
    program text NOT NULL,
    data jsonb NOT NULL,
    UNIQUE (universe, epoch, beneficiary, program),
    CHECK (data->>'id' = id::text),
    CHECK (data->>'universe' = universe::text),
    CHECK (data->>'epoch' = epoch::text),
    CHECK (data->>'beneficiary' = beneficiary::text),
    CHECK (data->'program'->>'id' = program)
);
CREATE INDEX objective_runs_owner ON objective_runs(universe, epoch, beneficiary);
