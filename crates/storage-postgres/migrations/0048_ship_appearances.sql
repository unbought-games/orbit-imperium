-- Freeze each empire's authored emblem independently of reusable account templates.
ALTER TABLE empire_insignias DROP CONSTRAINT empire_insignias_account_design_id_fkey;
ALTER TABLE empire_insignias ADD COLUMN recipe jsonb;
ALTER TABLE empire_insignias ADD COLUMN revision bigint NOT NULL DEFAULT 0;
UPDATE empire_insignias e SET recipe=d.recipe,revision=1 FROM insignia_designs d
 WHERE d.account=e.account AND d.id=e.design_id;
DROP TRIGGER orbit_design_appearance ON insignia_designs;
DROP TRIGGER orbit_equipped_appearance ON empire_insignias;
CREATE OR REPLACE FUNCTION capture_orbit_appearance() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE stamp bigint := floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
BEGIN
 INSERT INTO orbit_appearance_history(player,observed_at,recipe)
 SELECT m.player,GREATEST(stamp,COALESCE((SELECT max(h.observed_at)+1 FROM orbit_appearance_history h WHERE h.player=m.player),stamp)),NEW.recipe FROM universe_memberships m
 WHERE m.universe=NEW.universe AND m.account=NEW.account;
 RETURN NEW;
END $$;
CREATE TRIGGER orbit_equipped_appearance AFTER INSERT OR UPDATE OF recipe ON empire_insignias
 FOR EACH ROW EXECUTE FUNCTION capture_orbit_appearance();

CREATE TABLE ship_design_revisions (
 account uuid NOT NULL REFERENCES accounts ON DELETE CASCADE,
 id uuid NOT NULL, revision bigint NOT NULL CHECK(revision>0),
 name text NOT NULL CHECK(char_length(name) BETWEEN 1 AND 40),
 target text NOT NULL, recipe jsonb NOT NULL,
 PRIMARY KEY(account,id,revision)
);
CREATE TABLE empire_ship_equipment (
 universe uuid NOT NULL, account uuid NOT NULL, target text NOT NULL,
 revision bigint NOT NULL DEFAULT 0, design_id uuid, design_revision bigint,
 latest_request uuid, artwork uuid,
 PRIMARY KEY(universe,account,target),
 FOREIGN KEY(universe,account) REFERENCES universe_memberships ON DELETE CASCADE,
 FOREIGN KEY(account,design_id,design_revision) REFERENCES ship_design_revisions(account,id,revision),
 CHECK((design_id IS NULL)=(design_revision IS NULL))
);
CREATE TABLE ship_render_requests (
 id uuid PRIMARY KEY, universe uuid NOT NULL, account uuid NOT NULL REFERENCES accounts ON DELETE CASCADE, player uuid NOT NULL, epoch uuid NOT NULL, target text NOT NULL,
 equipment_revision bigint NOT NULL, emblem_revision bigint NOT NULL, input jsonb NOT NULL,
 stage text NOT NULL CHECK(stage IN ('queued','rendering','preparing','ready','failed','superseded','canceled')),
 lease uuid, lease_until timestamptz, error text,
 cancel_requested boolean NOT NULL DEFAULT false,
 not_before timestamptz NOT NULL DEFAULT clock_timestamp(),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE UNIQUE INDEX ship_one_running ON ship_render_requests(universe,account,target) WHERE lease IS NOT NULL;
CREATE UNIQUE INDEX ship_one_pending ON ship_render_requests(universe,account,target) WHERE stage='queued';
CREATE TABLE ship_artifacts (
 id uuid PRIMARY KEY, account uuid NOT NULL REFERENCES accounts ON DELETE CASCADE,
 request uuid NOT NULL REFERENCES ship_render_requests ON DELETE CASCADE,
 variants jsonb NOT NULL
);
CREATE TABLE ship_appearance_actions (
 universe uuid NOT NULL, account uuid NOT NULL, request_id uuid NOT NULL, action jsonb NOT NULL,
 PRIMARY KEY(universe,account,request_id),
 FOREIGN KEY(universe,account) REFERENCES universe_memberships ON DELETE CASCADE
);

-- Older API writers cannot author an empire copy. Reject the complete transaction
-- rather than silently accepting template-only edits or stale equipment pointers.
CREATE FUNCTION guard_empire_insignia_writer() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' AND NOT EXISTS(SELECT 1 FROM accounts WHERE id=OLD.account) THEN RETURN OLD; END IF;
 IF current_setting('orbit.empire_insignia_writer',true) IS DISTINCT FROM '1' THEN
  RAISE EXCEPTION 'Empire insignia writes require the current API binary' USING ERRCODE='23514';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE TRIGGER empire_insignia_writer BEFORE INSERT OR UPDATE ON empire_insignias
 FOR EACH ROW EXECUTE FUNCTION guard_empire_insignia_writer();
CREATE TRIGGER insignia_template_writer BEFORE UPDATE OR DELETE ON insignia_designs
 FOR EACH ROW EXECUTE FUNCTION guard_empire_insignia_writer();
