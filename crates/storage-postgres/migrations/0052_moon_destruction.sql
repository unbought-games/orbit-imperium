-- A historical moon ID survives both its body and any later parent removal.
CREATE TABLE destroyed_moons (
    universe uuid NOT NULL REFERENCES universes ON DELETE CASCADE,
    id uuid PRIMARY KEY,
    owner uuid NOT NULL,
    data jsonb NOT NULL
);
CREATE INDEX destroyed_moons_owner ON destroyed_moons(universe, owner);

ALTER TABLE manufacturing_batches DROP CONSTRAINT manufacturing_status_valid;
ALTER TABLE manufacturing_batches ADD CONSTRAINT manufacturing_status_valid CHECK
    (((data->>'status') IN ('Active','Completed','Cancelled','BodyAbandoned','BodyDestroyed')) IS TRUE) NOT VALID;
