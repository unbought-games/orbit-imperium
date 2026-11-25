-- LISTEN is a wakeup hint. The committed work tables remain authoritative
-- after notification loss, restart, duplicate delivery and missed deadlines.
CREATE FUNCTION wake_order_worker() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_notify('orbit_work_ready', '');
 RETURN NULL;
END
$$;
CREATE TRIGGER command_worker_wake AFTER INSERT ON commands
 FOR EACH STATEMENT EXECUTE FUNCTION wake_order_worker();
CREATE TRIGGER event_worker_wake AFTER INSERT ON scheduled_events
 FOR EACH STATEMENT EXECUTE FUNCTION wake_order_worker();
CREATE TRIGGER barrier_worker_wake AFTER INSERT ON runtime_barriers
 FOR EACH STATEMENT EXECUTE FUNCTION wake_order_worker();
-- Keep both immutable command identities, receipts and the historical rate
-- accounting. New executors settle marked gestures with their paired action.
-- Existing pending pairs retain their original execution path.
ALTER TABLE commands ADD COLUMN inline_presence boolean NOT NULL DEFAULT false;
