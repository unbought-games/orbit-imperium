SET LOCAL lock_timeout = '1s';

ALTER TABLE game_update_heads ADD COLUMN retired_through bigint NOT NULL DEFAULT 0
    CHECK (retired_through BETWEEN 0 AND position);

-- The stable default gives pre-migration history a full initial grace without
-- rewriting it. Pending rows get a fresh clock when they actually settle.
ALTER TABLE commands ADD COLUMN retention_since timestamptz NOT NULL DEFAULT statement_timestamp();
ALTER TABLE scheduled_events ADD COLUMN retention_since timestamptz NOT NULL DEFAULT statement_timestamp();
CREATE FUNCTION stamp_terminal_input() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.retention_since := clock_timestamp();
    RETURN NEW;
END $$;
CREATE TRIGGER command_completed BEFORE UPDATE OF done ON commands
    FOR EACH ROW WHEN (NEW.done AND NOT OLD.done) EXECUTE FUNCTION stamp_terminal_input();
CREATE TRIGGER event_retired BEFORE UPDATE OF done,cancelled ON scheduled_events
    FOR EACH ROW WHEN ((NEW.done OR NEW.cancelled) AND NOT (OLD.done OR OLD.cancelled))
    EXECUTE FUNCTION stamp_terminal_input();

CREATE INDEX command_retention ON commands(universe,retention_since,input_id) WHERE done;
CREATE INDEX event_retention ON scheduled_events(universe,retention_since,id) WHERE done OR cancelled;
CREATE INDEX claimed_scope_input ON execution_scopes(universe,claim_input) WHERE claim_input IS NOT NULL;
CREATE INDEX delivered_activity_retention ON analytics_delivery(acknowledged_at,event_id)
    WHERE state='delivered' AND fact_key LIKE 'activity:%';

-- The historical high-bit machine presence UUID is internal to the pair.
-- Other old browser pairs could supply independently timed identities.
CREATE FUNCTION command_deadline_ms(identity uuid, legacy_until bigint)
RETURNS bigint LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
    SELECT CASE WHEN substring(identity::text,15,1)='7' AND substring(identity::text,20,1) IN ('8','9','a','b')
        THEN (('x' || left(replace(identity::text,'-',''),12))::bit(48)::bigint) + 900000
        ELSE legacy_until END
$$;
