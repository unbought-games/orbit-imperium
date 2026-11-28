-- The coordinated migrator stops the old API and workers before this cutover.
-- Their population must not change between migration and catalog score rebuild.
DO $$
BEGIN
    IF NOT pg_try_advisory_xact_lock(901321) THEN
        RAISE EXCEPTION 'stop serving roles before upgrading asset valuation';
    END IF;
END $$;

-- All completed quantities already live in inventories, active fleet manifests,
-- building_levels or research_levels. Durable order and fleet data stays in place.
-- The marker survives interruption between DDL and the batched calculation.
CREATE TABLE catalog_score_upgrades (
    universe uuid PRIMARY KEY REFERENCES universes(id) ON DELETE CASCADE
);
INSERT INTO catalog_score_upgrades
    SELECT w.universe FROM world_heads w WHERE EXISTS
        (SELECT 1 FROM universe_memberships m WHERE m.universe=w.universe);
UPDATE players SET current_score_micro=NULL WHERE universe IN (SELECT universe FROM catalog_score_upgrades);
DROP TABLE asset_lots;
