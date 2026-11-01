CREATE TABLE attack_groups (
    id uuid PRIMARY KEY,
    universe uuid NOT NULL REFERENCES universes(id),
    data jsonb NOT NULL
);
CREATE INDEX attack_groups_members ON attack_groups USING gin ((data->'members'));
CREATE INDEX attack_groups_invited ON attack_groups USING gin ((data->'invited'));
CREATE INDEX attack_groups_universe ON attack_groups(universe);
