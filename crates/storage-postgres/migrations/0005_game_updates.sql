-- Delivery positions are recipient-local publication identities, not gameplay state.
CREATE TABLE game_update_heads (
    universe uuid NOT NULL REFERENCES universes ON DELETE CASCADE,
    epoch uuid NOT NULL,
    player uuid NOT NULL REFERENCES players ON DELETE CASCADE,
    position bigint NOT NULL DEFAULT 0 CHECK(position>=0),
    PRIMARY KEY(universe,epoch,player)
);
CREATE TABLE game_updates (
    universe uuid NOT NULL,
    epoch uuid NOT NULL,
    player uuid NOT NULL,
    position bigint NOT NULL CHECK(position>0),
    input_id uuid NOT NULL,
    kind text NOT NULL CHECK(kind IN ('outcome','invalidate')),
    minimum_revision bigint,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY(universe,epoch,player,position),
    UNIQUE(universe,epoch,player,input_id,kind),
    FOREIGN KEY(universe,epoch,player) REFERENCES game_update_heads ON DELETE CASCADE,
    CHECK((kind='outcome' AND minimum_revision IS NULL) OR (kind='invalidate' AND minimum_revision>=0))
);
CREATE INDEX game_updates_retention ON game_updates(created_at);
