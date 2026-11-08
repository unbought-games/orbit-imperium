-- 0039 seeded these sets in display order. Objective persistence compares the
-- complete JSONB value with Rust's serialization, whose ShipType order puts
-- SmallCargo before LightFighter. Preserve every member and all other fields;
-- do not rewrite the published migration or change accepted work/program terms.
WITH normalized AS (
    SELECT r.id, jsonb_agg(
        CASE WHEN objective->'predicate'->>'kind' IN ('RaidLoaded', 'RaidReturn')
                   AND objective->'predicate'->'required_ships' = '["LightFighter","SmallCargo"]'::jsonb
             THEN jsonb_set(objective, '{predicate,required_ships}', '["SmallCargo","LightFighter"]'::jsonb)
             ELSE objective END ORDER BY ordinal
    ) AS objectives
    FROM objective_runs r,
         LATERAL jsonb_array_elements(r.data->'program'->'objectives') WITH ORDINALITY AS items(objective, ordinal)
    GROUP BY r.id
)
UPDATE objective_runs r
SET data = jsonb_set(r.data, '{program,objectives}', n.objectives)
FROM normalized n
WHERE r.id = n.id AND r.data->'program'->'objectives' IS DISTINCT FROM n.objectives;
