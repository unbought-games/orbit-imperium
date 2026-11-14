-- Additive and empty on deployment. Existing bodies need no backfill.
CREATE TABLE jump_gate_uses (
    universe uuid NOT NULL REFERENCES universes ON DELETE CASCADE,
    body uuid PRIMARY KEY REFERENCES bodies ON DELETE CASCADE,
    data jsonb NOT NULL
);
CREATE INDEX jump_gate_uses_universe ON jump_gate_uses(universe);
