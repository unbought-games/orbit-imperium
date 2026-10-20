-- Selective player and coordinate lookups; preserve existing queue and uniqueness indexes.
CREATE INDEX manufacturing_active_owner ON manufacturing_batches(universe,owner,body,queue_sequence) WHERE data->>'status'='Active';
CREATE INDEX construction_active_owner ON constructions(universe,owner,id) WHERE status='Active';
CREATE INDEX debris_coordinates_lookup ON debris_fields(universe,(data->'coordinates'));
CREATE INDEX mission_destination_coordinates ON mission_fleets(universe,(data->'intent'->'destination'->'coordinates')) WHERE data->>'leg' IN ('Outbound','Returning');
CREATE INDEX command_actor_recent ON commands(universe,actor,at_ms);
