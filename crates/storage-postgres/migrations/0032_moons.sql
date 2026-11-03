CREATE TABLE moon_genesis (
    universe uuid NOT NULL REFERENCES universes ON DELETE CASCADE,
    id uuid PRIMARY KEY REFERENCES bodies ON DELETE CASCADE,
    parent uuid NOT NULL UNIQUE REFERENCES bodies ON DELETE CASCADE,
    data jsonb NOT NULL
);
CREATE INDEX moon_genesis_universe ON moon_genesis(universe);
