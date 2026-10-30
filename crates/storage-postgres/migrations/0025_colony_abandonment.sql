-- Stable body IDs remain on historical jobs after voluntary removal. Gameplay
-- terminalizes unfinished jobs before deleting resident assets; no cascades.
ALTER TABLE constructions DROP CONSTRAINT constructions_body_fkey;
ALTER TABLE research_operations DROP CONSTRAINT research_operations_body_fkey;
ALTER TABLE manufacturing_batches DROP CONSTRAINT manufacturing_batches_body_fkey;
ALTER TABLE manufacturing_batches DROP CONSTRAINT manufacturing_status_valid;
ALTER TABLE manufacturing_batches ADD CONSTRAINT manufacturing_status_valid CHECK (((data->>'status') IN ('Active','Completed','Cancelled','BodyAbandoned')) IS TRUE) NOT VALID;
CREATE TABLE planet_abandonments (
    universe uuid NOT NULL REFERENCES universes ON DELETE CASCADE,
    id uuid PRIMARY KEY,
    data jsonb NOT NULL
);
CREATE UNIQUE INDEX planet_abandonments_occupied ON planet_abandonments
(universe, (data->'coordinates'->>'galaxy'), (data->'coordinates'->>'system'), (data->'coordinates'->>'position'))
WHERE NOT (data->>'released')::boolean;
