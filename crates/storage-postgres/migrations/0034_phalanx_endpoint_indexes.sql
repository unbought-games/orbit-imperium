-- Candidate lookup only: no history prerequisite, backfill or writer constraint.
-- Endpoint presence keeps these indexes out of unrelated owner/incoming plans.
-- Equality on the bound ID implies the predicate for each scan lookup branch.
CREATE INDEX mission_fleets_active_origin ON mission_fleets
    (universe, (data->'intent'->>'origin'))
    WHERE data->>'leg' IN ('Outbound','Holding','Returning')
      AND data->'intent'->>'origin' IS NOT NULL;
CREATE INDEX mission_fleets_active_destination ON mission_fleets
    (universe, (data->'intent'->'destination'->>'id'))
    WHERE data->>'leg' IN ('Outbound','Holding','Returning')
      AND data->'intent'->'destination'->>'id' IS NOT NULL;
CREATE INDEX missile_flights_active_destination ON missile_flights
    (universe, (data->'terms'->'intent'->'target'->>'id'))
    WHERE data->>'status'='InFlight'
      AND data->'terms'->'intent'->'target'->>'id' IS NOT NULL;
