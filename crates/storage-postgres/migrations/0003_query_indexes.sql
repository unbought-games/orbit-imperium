-- A retained world must prepare large indexes online before startup migration.
-- New empty databases still initialize in one atomic migration transaction.
DO $$
DECLARE ready integer;
BEGIN
  SELECT count(*) INTO ready FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND i.indisvalid AND c.relname IN ('command_actor_pending','body_owner_lookup','asset_lot_owner_lookup','mission_owner_leg_lookup','mission_target_owner_lookup','mission_report_page');
  IF ready<6 THEN
    IF EXISTS(SELECT 1 FROM commands) OR EXISTS(SELECT 1 FROM bodies)
      OR EXISTS(SELECT 1 FROM asset_lots) OR EXISTS(SELECT 1 FROM mission_fleets)
      OR EXISTS(SELECT 1 FROM mission_reports) THEN
      RAISE EXCEPTION 'retained runtime requires online index preparation: run scripts/prepare-runtime-indexes.sql and verify pg_index.indisvalid' USING CONSTRAINT='orbit_runtime_online_indexes';
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS command_actor_pending ON commands(universe,actor,at_ms,sequence) WHERE NOT done;
CREATE INDEX IF NOT EXISTS body_owner_lookup ON bodies(universe,owner,id);
CREATE INDEX IF NOT EXISTS asset_lot_owner_lookup ON asset_lots(universe,(data->>'owner'));
CREATE INDEX IF NOT EXISTS mission_owner_leg_lookup ON mission_fleets(universe,owner,(data->>'leg'),id);
CREATE INDEX IF NOT EXISTS mission_target_owner_lookup ON mission_fleets(universe,(data->'intent'->'destination'->>'expected_owner'));
CREATE INDEX IF NOT EXISTS mission_report_page ON mission_reports(universe,at_ms DESC,id DESC);
