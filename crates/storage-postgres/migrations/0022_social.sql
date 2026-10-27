-- Immutable content and delivery facts; no stored previews, counts, or rendered HTML.
CREATE TABLE conversations (
    id uuid PRIMARY KEY,
    universe uuid NOT NULL REFERENCES universes ON DELETE CASCADE,
    epoch uuid NOT NULL,
    player_low uuid NOT NULL,
    player_high uuid NOT NULL CHECK (player_high > player_low),
    created_at bigint NOT NULL,
    UNIQUE(universe, epoch, player_low, player_high),
    FOREIGN KEY(universe,player_low) REFERENCES universe_memberships(universe,player),
    FOREIGN KEY(universe,player_high) REFERENCES universe_memberships(universe,player)
);
CREATE INDEX conversations_high ON conversations(universe,epoch,player_high);
CREATE TABLE conversation_messages (
    id uuid PRIMARY KEY,
    conversation uuid NOT NULL REFERENCES conversations ON DELETE CASCADE,
    sequence bigint NOT NULL CHECK(sequence > 0),
    sender uuid NOT NULL REFERENCES players,
    body text NOT NULL CHECK(char_length(body) BETWEEN 1 AND 4000),
    sent_at bigint NOT NULL,
    UNIQUE(conversation,sequence)
);
CREATE INDEX conversation_sender_sequence ON conversation_messages(conversation,sender,sequence);
CREATE TABLE conversation_player_state (
    conversation uuid NOT NULL REFERENCES conversations ON DELETE CASCADE,
    player uuid NOT NULL REFERENCES players,
    last_read_sequence bigint NOT NULL DEFAULT 0 CHECK(last_read_sequence >= 0),
    hidden_through_sequence bigint NOT NULL DEFAULT 0 CHECK(hidden_through_sequence >= 0),
    PRIMARY KEY(conversation,player)
);
CREATE TABLE alliance_circulars (
    id uuid PRIMARY KEY,
    universe uuid NOT NULL REFERENCES universes ON DELETE CASCADE,
    epoch uuid NOT NULL,
    -- Historical identity: deliberately no FK to the live alliance.
    alliance uuid NOT NULL,
    alliance_name text NOT NULL,
    alliance_tag text NOT NULL,
    sender uuid NOT NULL REFERENCES players,
    body text NOT NULL CHECK(char_length(body) BETWEEN 1 AND 4000),
    sent_at bigint NOT NULL
);
CREATE TABLE alliance_circular_recipients (
    circular uuid NOT NULL REFERENCES alliance_circulars ON DELETE CASCADE,
    player uuid NOT NULL REFERENCES players,
    read_at bigint,
    hidden_at bigint,
    PRIMARY KEY(circular,player)
);
CREATE INDEX circular_recipient ON alliance_circular_recipients(player,circular);
CREATE INDEX circular_order ON alliance_circulars(universe,epoch,sent_at DESC,id DESC);
CREATE TABLE friend_relationships (
    universe uuid NOT NULL REFERENCES universes ON DELETE CASCADE,
    epoch uuid NOT NULL,
    player_low uuid NOT NULL,
    player_high uuid NOT NULL CHECK(player_high > player_low),
    request uuid NOT NULL UNIQUE,
    requested_by uuid NOT NULL CHECK(requested_by IN (player_low,player_high)),
    requested_at bigint NOT NULL,
    accepted_at bigint,
    PRIMARY KEY(universe,epoch,player_low,player_high),
    FOREIGN KEY(universe,player_low) REFERENCES universe_memberships(universe,player),
    FOREIGN KEY(universe,player_high) REFERENCES universe_memberships(universe,player)
);
CREATE INDEX friends_high ON friend_relationships(universe,epoch,player_high);
CREATE TABLE player_blocks (
    universe uuid NOT NULL REFERENCES universes ON DELETE CASCADE,
    epoch uuid NOT NULL,
    blocker uuid NOT NULL,
    blocked uuid NOT NULL CHECK(blocker <> blocked),
    created_at bigint NOT NULL,
    PRIMARY KEY(universe,epoch,blocker,blocked),
    FOREIGN KEY(universe,blocker) REFERENCES universe_memberships(universe,player),
    FOREIGN KEY(universe,blocked) REFERENCES universe_memberships(universe,player)
);
CREATE TABLE social_command_receipts (
    universe uuid NOT NULL REFERENCES universes ON DELETE CASCADE,
    epoch uuid NOT NULL,
    account uuid NOT NULL REFERENCES accounts,
    player uuid NOT NULL,
    command_id uuid NOT NULL,
    intent_hash text NOT NULL,
    result jsonb NOT NULL,
    PRIMARY KEY(universe,epoch,account,player,command_id)
);
