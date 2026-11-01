-- Authentication time is independent of the rolling idle expiry. Existing sessions
-- must sign in again before requesting destructive empire removal.
ALTER TABLE sessions ADD COLUMN authenticated_at bigint NOT NULL DEFAULT 0;
CREATE INDEX empire_deletion_pending ON scheduled_events(universe, (event->>'player'))
WHERE event->>'type'='EmpireDeletionDue' AND NOT done AND NOT cancelled;
-- Historical conversations retain stable player identities after a membership ends.
ALTER TABLE players ADD CONSTRAINT players_universe_id_unique UNIQUE(universe,id);
ALTER TABLE conversations DROP CONSTRAINT conversations_universe_player_low_fkey;
ALTER TABLE conversations DROP CONSTRAINT conversations_universe_player_high_fkey;
ALTER TABLE conversations ADD CONSTRAINT conversations_universe_player_low_fkey
    FOREIGN KEY(universe,player_low) REFERENCES players(universe,id);
ALTER TABLE conversations ADD CONSTRAINT conversations_universe_player_high_fkey
    FOREIGN KEY(universe,player_high) REFERENCES players(universe,id);
