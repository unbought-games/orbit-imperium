ALTER TABLE universe_memberships
    ADD COLUMN galaxy_probe_count text NOT NULL DEFAULT '1'
    CHECK (galaxy_probe_count ~ '^[1-9][0-9]*$');
