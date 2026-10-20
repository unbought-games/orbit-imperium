-- Run once against the retained primary before deploying this schema migration.
-- Run with psql -v ON_ERROR_STOP=1 without a surrounding transaction.
-- If interrupted, inspect pg_index.indisvalid and drop only an invalid listed
-- index with DROP INDEX CONCURRENTLY before rerunning this file.
CREATE INDEX CONCURRENTLY IF NOT EXISTS command_actor_pending ON commands(universe,actor,at_ms,sequence) WHERE NOT done;
CREATE INDEX CONCURRENTLY IF NOT EXISTS body_owner_lookup ON bodies(universe,owner,id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS asset_lot_owner_lookup ON asset_lots(universe,(data->>'owner'));
CREATE INDEX CONCURRENTLY IF NOT EXISTS mission_owner_leg_lookup ON mission_fleets(universe,owner,(data->>'leg'),id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS mission_target_owner_lookup ON mission_fleets(universe,(data->'intent'->'destination'->>'expected_owner'));
CREATE INDEX CONCURRENTLY IF NOT EXISTS mission_report_page ON mission_reports(universe,at_ms DESC,id DESC);
