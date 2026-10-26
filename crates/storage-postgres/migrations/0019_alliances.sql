-- Social source facts. Counts, effective permissions, rendered text and scores are derived.
CREATE TABLE alliances (
    universe uuid NOT NULL REFERENCES universes ON DELETE CASCADE,
    epoch uuid NOT NULL,
    id uuid PRIMARY KEY,
    name text NOT NULL CHECK (char_length(name) BETWEEN 3 AND 48),
    tag text NOT NULL CHECK (tag ~ '^[A-Za-z0-9]{3,8}$'),
    leader uuid NOT NULL,
    recruitment text NOT NULL CHECK (recruitment IN ('Open','Application','Closed')),
    public_text text NOT NULL CHECK (char_length(public_text) <= 8000),
    revision bigint NOT NULL CHECK (revision > 0),
    roles jsonb NOT NULL CHECK (jsonb_typeof(roles)='array'),
    posts jsonb NOT NULL CHECK (jsonb_typeof(posts)='array' AND jsonb_array_length(posts)<=100),
    audit jsonb NOT NULL CHECK (jsonb_typeof(audit)='array' AND jsonb_array_length(audit)<=100),
    UNIQUE(universe,epoch,id),
    FOREIGN KEY(universe,leader) REFERENCES universe_memberships(universe,player)
);
CREATE UNIQUE INDEX alliance_name_unique ON alliances(universe,epoch,lower(name));
CREATE UNIQUE INDEX alliance_tag_unique ON alliances(universe,epoch,lower(tag));
CREATE TABLE alliance_memberships (
    universe uuid NOT NULL,
    epoch uuid NOT NULL,
    player uuid NOT NULL,
    alliance uuid NOT NULL,
    joined_at bigint NOT NULL CHECK(joined_at>=0),
    roles jsonb NOT NULL CHECK(jsonb_typeof(roles)='array'),
    PRIMARY KEY(universe,epoch,player),
    FOREIGN KEY(universe,epoch,alliance) REFERENCES alliances(universe,epoch,id) ON DELETE CASCADE,
    FOREIGN KEY(universe,player) REFERENCES universe_memberships(universe,player)
);
CREATE INDEX alliance_roster ON alliance_memberships(alliance,player);
CREATE TABLE alliance_applications (
    id uuid PRIMARY KEY,
    universe uuid NOT NULL,
    epoch uuid NOT NULL,
    alliance uuid NOT NULL,
    player uuid NOT NULL,
    text text NOT NULL CHECK(char_length(text)<=4000),
    created_at bigint NOT NULL CHECK(created_at>=0),
    UNIQUE(universe,epoch,alliance,player),
    FOREIGN KEY(universe,epoch,alliance) REFERENCES alliances(universe,epoch,id) ON DELETE CASCADE,
    FOREIGN KEY(universe,player) REFERENCES universe_memberships(universe,player)
);
CREATE INDEX alliance_applicant ON alliance_applications(universe,epoch,player);
-- Receipts deliberately have no alliance FK: retries survive leave and disband.
CREATE TABLE alliance_command_receipts (
    universe uuid NOT NULL REFERENCES universes ON DELETE CASCADE,
    epoch uuid NOT NULL,
    account uuid NOT NULL REFERENCES accounts,
    player uuid NOT NULL,
    command_id uuid NOT NULL,
    intent_hash text NOT NULL,
    result jsonb NOT NULL,
    PRIMARY KEY(universe,epoch,account,player,command_id)
);
-- Historical source affiliation, including identity as observed during each interval.
-- No FK to the live alliance: disband must preserve delayed report attribution.
CREATE TABLE alliance_affiliation_history (
    id bigserial PRIMARY KEY,
    universe uuid NOT NULL REFERENCES universes ON DELETE CASCADE,
    epoch uuid NOT NULL,
    player uuid NOT NULL,
    valid_from bigint NOT NULL,
    valid_until bigint CHECK(valid_until>=valid_from),
    alliance uuid NOT NULL,
    tag text NOT NULL,
    name text NOT NULL
);
CREATE UNIQUE INDEX alliance_current_affiliation ON alliance_affiliation_history(universe,epoch,player) WHERE valid_until IS NULL;
CREATE INDEX alliance_historical_affiliation ON alliance_affiliation_history(universe,epoch,player,valid_from);
