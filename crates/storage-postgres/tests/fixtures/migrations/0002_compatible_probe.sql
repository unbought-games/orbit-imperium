CREATE TABLE upgrade_probe (value integer);
-- Optional harness barrier: the application schema never creates this gate table.
DO $$ BEGIN
    IF to_regclass('public.orbit_test_migration_gate') IS NOT NULL THEN
        PERFORM pg_advisory_xact_lock(901324);
    END IF;
END $$;
INSERT INTO upgrade_probe VALUES (42);
