-- Original enrollment fact; retained and old-writer memberships remain unknown.
-- No default or backfill: account creation and first activity are different events.
ALTER TABLE universe_memberships
    ADD COLUMN joined_at_ms bigint
    CONSTRAINT universe_memberships_joined_at_ms_nonnegative CHECK (joined_at_ms >= 0);
COMMENT ON COLUMN universe_memberships.joined_at_ms IS
    'Original server enrollment logical time in Unix milliseconds, clamped to runtime/admission frontiers; NULL means unknown. Development seeds use their explicit fixture time.';
