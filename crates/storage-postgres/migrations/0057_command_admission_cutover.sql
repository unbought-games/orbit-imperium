-- One installation-wide deadline, shared by all replicas and preserved through restart.
-- During these seven days old official browsers and bots may still submit UUIDv4.
CREATE TABLE command_admission_cutover (
    singleton boolean PRIMARY KEY CHECK (singleton),
    legacy_until_ms bigint NOT NULL
);
INSERT INTO command_admission_cutover VALUES (
    true, floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint + 604800000
);
