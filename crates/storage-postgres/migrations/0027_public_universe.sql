-- Publication scheduling facts, shared by all workers. No gameplay mutations.
CREATE TABLE public_feed_jobs (
    universe uuid NOT NULL REFERENCES universes(id) ON DELETE CASCADE,
    feed text NOT NULL CHECK (feed IN ('players', 'planets')),
    epoch uuid NOT NULL,
    boundary bigint NOT NULL,
    attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 4),
    retry_at bigint NOT NULL,
    token uuid,
    PRIMARY KEY (universe, feed)
);
-- Latest immutable source observation per feed; totals and ranks are never stored.
CREATE TABLE public_feed_observations (
    universe uuid NOT NULL REFERENCES universes(id) ON DELETE CASCADE,
    feed text NOT NULL CHECK (feed IN ('players', 'planets')),
    epoch uuid NOT NULL,
    boundary bigint NOT NULL,
    sampled_at bigint NOT NULL,
    source jsonb NOT NULL,
    PRIMARY KEY (universe, feed)
);
