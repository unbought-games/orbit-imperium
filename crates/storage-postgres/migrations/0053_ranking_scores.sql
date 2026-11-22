-- A retained player's NULL survives the upgrade until a batch or gameplay write
-- initializes it. New players start with no completed asset lots.
ALTER TABLE players ADD COLUMN current_score_micro bigint;
ALTER TABLE players ALTER COLUMN current_score_micro SET DEFAULT 0;
ALTER TABLE players ADD CONSTRAINT players_current_score_nonnegative
    CHECK (current_score_micro >= 0) NOT VALID;

CREATE TABLE ranking_daily_snapshots (
    universe uuid NOT NULL REFERENCES universes(id) ON DELETE CASCADE,
    epoch uuid NOT NULL,
    day bigint NOT NULL,
    sampled_at bigint NOT NULL,
    standings jsonb NOT NULL,
    PRIMARY KEY (universe, epoch, day)
);

-- Leave legacy player feeds in place for replacement by the first compact
-- publication; new readers can identify their format without reading source.
ALTER TABLE public_feed_observations ADD COLUMN compact_players boolean NOT NULL DEFAULT false;
UPDATE public_feed_jobs SET attempts=0, token=NULL, retry_at=boundary WHERE feed='players';
