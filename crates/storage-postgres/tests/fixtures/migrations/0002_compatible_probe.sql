CREATE TABLE upgrade_probe (value integer);
-- Optional harness barrier: the application schema never creates this gate table.
DO $$ BEGIN
    IF to_regclass('public.orbit_test_migration_gate') IS NOT NULL THEN
        -- This is a test pause, not a DDL contention test. Keep the production
        -- one-second lock timeout intact while exercising killed-migrator rollback.
        WHILE NOT pg_try_advisory_xact_lock(901324) LOOP
            PERFORM pg_sleep(0.025);
        END LOOP;
    END IF;
END $$;
INSERT INTO upgrade_probe VALUES (42);
