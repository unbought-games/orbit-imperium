-- One-time arrival presentation. Only signups after this release get a row;
-- existing members, bots and operator-added players never see the scene.
CREATE TABLE empire_arrivals (
    player uuid PRIMARY KEY REFERENCES players ON DELETE CASCADE,
    universe uuid NOT NULL REFERENCES universes ON DELETE CASCADE,
    completed_at_ms bigint CHECK (completed_at_ms >= 0)
);

-- A player's chosen planet look. Absent means the orbit-slot default.
CREATE TABLE body_appearances (
    body uuid PRIMARY KEY REFERENCES bodies ON DELETE CASCADE,
    art_slot smallint NOT NULL CHECK (art_slot BETWEEN 1 AND 15)
);
