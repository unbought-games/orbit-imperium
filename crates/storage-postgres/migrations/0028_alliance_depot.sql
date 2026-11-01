CREATE TABLE depot_supplies (
    id uuid PRIMARY KEY,
    universe uuid NOT NULL REFERENCES universes(id),
    source_planet uuid NOT NULL,
    at_ms bigint NOT NULL,
    data jsonb NOT NULL
);
CREATE INDEX depot_supplies_source ON depot_supplies(universe,source_planet,at_ms);
CREATE INDEX mission_fleets_holding_target ON mission_fleets(universe,(data->'intent'->'destination'->>'id'))
    WHERE data->'intent'->>'mission'='Hold' AND data->>'leg' IN ('Outbound','Holding');
ALTER TABLE mission_fleets DROP CONSTRAINT mission_leg_valid;
ALTER TABLE mission_fleets ADD CONSTRAINT mission_leg_valid CHECK (((data->>'leg') IN ('Outbound','Holding','Returning','Returned','Destroyed','Colonized','Deployed')) IS TRUE);
DROP INDEX mission_active;
CREATE INDEX mission_active ON mission_fleets(universe,id) WHERE data->>'leg' IN ('Outbound','Holding','Returning');
DROP INDEX mission_destination_coordinates;
CREATE INDEX mission_destination_coordinates ON mission_fleets(universe,(data->'intent'->'destination'->'coordinates')) WHERE data->>'leg' IN ('Outbound','Holding','Returning');
