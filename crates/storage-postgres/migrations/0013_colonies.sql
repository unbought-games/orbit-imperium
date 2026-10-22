-- Lifecycle heads only: occupancy remains authoritative in bodies. This trigger
-- also covers enrollments from the previous compatible binary during rollout.
CREATE TABLE planet_slot_revisions (
  universe uuid NOT NULL REFERENCES universes ON DELETE CASCADE,
  galaxy integer NOT NULL, system integer NOT NULL, position integer NOT NULL,
  revision bigint NOT NULL CHECK(revision >= 0),
  PRIMARY KEY(universe,galaxy,system,position)
);
-- Retained occupied slots use implicit birth revision 1 when no head exists.
-- No population-dependent backfill runs during startup.
CREATE FUNCTION orbit_planet_slot_created() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.kind='Planet' THEN
    INSERT INTO planet_slot_revisions VALUES(NEW.universe,NEW.galaxy,NEW.system,NEW.position,1)
    ON CONFLICT(universe,galaxy,system,position)
    DO UPDATE SET revision=planet_slot_revisions.revision+1;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER orbit_planet_slot_created AFTER INSERT ON bodies
FOR EACH ROW EXECUTE FUNCTION orbit_planet_slot_created();
CREATE TABLE colony_genesis (
  universe uuid NOT NULL REFERENCES universes ON DELETE CASCADE,
  id uuid PRIMARY KEY REFERENCES bodies ON DELETE CASCADE,
  data jsonb NOT NULL
);
-- Existing terminal rows remain valid; only new vocabulary is admitted.
ALTER TABLE mission_fleets DROP CONSTRAINT mission_leg_valid;
ALTER TABLE mission_fleets ADD CONSTRAINT mission_leg_valid
CHECK (((data->>'leg') IN ('Outbound','Returning','Returned','Destroyed','Colonized','Deployed')) IS TRUE) NOT VALID;
-- The old validated constraint proved every retained row satisfies this broader
-- predicate. NOT VALID avoids scanning history during bounded startup; all new
-- or updated rows are checked by PostgreSQL.

