-- Daily historical source observations. No computed scores or ranks are stored.
CREATE TABLE ranking_observations (
    universe uuid NOT NULL REFERENCES universes(id) ON DELETE CASCADE,
    epoch uuid NOT NULL,
    day bigint NOT NULL,
    observation jsonb NOT NULL,
    PRIMARY KEY (universe, epoch, day)
);
