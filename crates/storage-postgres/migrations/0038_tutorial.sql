-- Explicit maintenance activation only. Existing worlds stay dormant.
ALTER TABLE universe_runtime ADD COLUMN tutorial_enabled boolean NOT NULL DEFAULT false;
CREATE TABLE tutorial_preferences (
    universe uuid NOT NULL REFERENCES universes ON DELETE CASCADE,
    epoch uuid NOT NULL,
    player uuid NOT NULL REFERENCES players ON DELETE CASCADE,
    data jsonb NOT NULL,
    PRIMARY KEY(universe,epoch,player)
);
