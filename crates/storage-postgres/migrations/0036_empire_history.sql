-- Historical identity and authorship outlive active memberships. Universe IDs
-- intentionally have no cascading FK: closure/reset must not erase an archive.
CREATE TABLE orbit_profiles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account uuid UNIQUE REFERENCES accounts(id) ON DELETE SET NULL
);
CREATE TABLE empire_profiles (
    player uuid PRIMARY KEY,
    profile uuid NOT NULL REFERENCES orbit_profiles(id),
    universe uuid NOT NULL,
    epoch uuid NOT NULL,
    universe_name text NOT NULL,
    recorded_name text NOT NULL,
    joined_at bigint,
    removed boolean NOT NULL DEFAULT false,
    public boolean NOT NULL DEFAULT false,
    revision bigint NOT NULL DEFAULT 0
);
CREATE INDEX empire_profiles_owner ON empire_profiles(profile);
CREATE TABLE empire_history (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    player uuid NOT NULL REFERENCES empire_profiles(player),
    source text NOT NULL,
    kind text NOT NULL CHECK(kind IN ('Joined','Colonized','Abandoned','AllianceJoined','AllianceLeft','AllianceKicked','AllianceDisbanded','Battle','CampaignResult')),
    at_ms bigint,
    facts jsonb NOT NULL DEFAULT '{}',
    -- Keep the original immutable report as the single authoritative payload.
    -- A retained battle cannot be physically purged; inbox deletion is separate.
    report uuid REFERENCES mission_reports(id),
    UNIQUE(player, source)
);
CREATE INDEX empire_history_timeline ON empire_history(player, at_ms DESC, id);
CREATE TABLE empire_timeline (
    event uuid PRIMARY KEY REFERENCES empire_history(id),
    caption text NOT NULL DEFAULT '' CHECK(char_length(caption)<=2000),
    featured boolean NOT NULL DEFAULT false
);
CREATE TABLE commemorative_publications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event uuid NOT NULL UNIQUE REFERENCES empire_history(id),
    caption text NOT NULL DEFAULT '' CHECK(char_length(caption)<=2000),
    published_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE empire_profile_receipts (
    player uuid NOT NULL REFERENCES empire_profiles(player),
    command uuid NOT NULL,
    account uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    intent text NOT NULL,
    PRIMARY KEY(player, command)
);
CREATE TABLE campaign_history (
    universe uuid NOT NULL,
    epoch uuid NOT NULL,
    source uuid NOT NULL,
    resolved_at bigint NOT NULL,
    outcome text NOT NULL,
    beneficiaries uuid[] NOT NULL,
    closed_at bigint,
    PRIMARY KEY(universe,epoch)
);

CREATE FUNCTION capture_empire_identity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE profile_id uuid;
BEGIN
    INSERT INTO orbit_profiles(account) VALUES(NEW.account) ON CONFLICT(account) DO NOTHING;
    SELECT id INTO profile_id FROM orbit_profiles WHERE account=NEW.account;
    INSERT INTO empire_profiles(player,profile,universe,epoch,universe_name,recorded_name,joined_at)
        SELECT NEW.player,profile_id,u.id,u.epoch,u.name,a.name,NEW.joined_at_ms
        FROM universes u,accounts a WHERE u.id=NEW.universe AND a.id=NEW.account
        ON CONFLICT(player) DO NOTHING;
    INSERT INTO empire_history(player,source,kind,at_ms,facts)
        SELECT NEW.player,'enrollment','Joined',NEW.joined_at_ms,
            jsonb_build_object('name',recorded_name) FROM empire_profiles WHERE player=NEW.player
        ON CONFLICT DO NOTHING;
    RETURN NEW;
END $$;
CREATE TRIGGER empire_identity AFTER INSERT ON universe_memberships
    FOR EACH ROW EXECUTE FUNCTION capture_empire_identity();

INSERT INTO orbit_profiles(account) SELECT DISTINCT account FROM universe_memberships;
INSERT INTO empire_profiles(player,profile,universe,epoch,universe_name,recorded_name,joined_at)
    SELECT m.player,p.id,u.id,u.epoch,u.name,a.name,m.joined_at_ms
    FROM universe_memberships m JOIN universes u ON u.id=m.universe
    JOIN accounts a ON a.id=m.account JOIN orbit_profiles p ON p.account=m.account;
-- Old names are only known as observed at installation, never claimed event-time names.
INSERT INTO empire_history(player,source,kind,at_ms,facts)
    SELECT player,'enrollment','Joined',joined_at,'{}' FROM empire_profiles;

CREATE FUNCTION hide_removed_empire() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    UPDATE empire_profiles SET removed=true,public=false,revision=revision+1
        WHERE player=OLD.player;
    RETURN OLD;
END $$;
CREATE TRIGGER empire_profile_removal BEFORE DELETE ON universe_memberships
    FOR EACH ROW EXECUTE FUNCTION hide_removed_empire();

CREATE FUNCTION detach_orbit_profile() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.account IS NULL AND OLD.account IS NOT NULL THEN
        DELETE FROM orbit_name_history WHERE account=OLD.account;
        UPDATE empire_profiles SET removed=true,public=false,revision=revision+1 WHERE profile=NEW.id;
        DELETE FROM empire_timeline WHERE event IN
            (SELECT h.id FROM empire_history h JOIN empire_profiles p ON p.player=h.player WHERE p.profile=NEW.id);
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER orbit_profile_detachment AFTER UPDATE OF account ON orbit_profiles
    FOR EACH ROW EXECUTE FUNCTION detach_orbit_profile();

-- Reuse only retained evidence; no current name/strength is substituted for past facts.
INSERT INTO empire_history(player,source,kind,at_ms,facts,report)
SELECT p.player,'report:'||r.id,'Battle',r.at_ms,
    jsonb_build_object('names',COALESCE(s.names_at_publication,'{}'::jsonb),
        'alliances',CASE WHEN r.data->'payloads'->(p.player::text)->>'kind'='Combat' THEN COALESCE(ai.identities,'{}'::jsonb) ELSE '{}'::jsonb END,'outcome',r.data->'payloads'->(p.player::text)->'outcome'),r.id
FROM mission_reports r JOIN empire_profiles p ON p.universe=r.universe
LEFT JOIN mission_report_alliances ai ON ai.report=r.id
LEFT JOIN mission_report_shares s ON s.report=r.id AND s.recipient=p.player
WHERE r.kind='Combat' AND r.data->'payloads' ? p.player::text;
INSERT INTO empire_history(player,source,kind,at_ms,facts)
SELECT p.player,'report:'||r.id,'Colonized',r.at_ms,
    jsonb_build_object('body',r.data->'payloads'->(p.player::text)->'body',
        'fields',r.data->'payloads'->(p.player::text)->'fields',
        'destination_coordinates',r.data->'payloads'->(p.player::text)->'destination_coordinates')
FROM mission_reports r JOIN empire_profiles p ON p.universe=r.universe
WHERE r.kind='Colonized' AND r.data->'payloads' ? p.player::text;
INSERT INTO empire_history(player,source,kind,at_ms,facts)
SELECT p.player,'abandon:'||(a.data->>'input'),'Abandoned',(a.data->>'removed_at')::bigint,
    jsonb_build_object('body',a.id,'coordinates',a.data->'coordinates')
FROM planet_abandonments a JOIN empire_profiles p ON p.player=(a.data->>'owner')::uuid;

-- A display name is known from observation forward, not retroactively. These
-- observations allow delayed battle resolution to use the name known at contact.
CREATE TABLE orbit_name_history (
    account uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    observed_at bigint NOT NULL,
    name text NOT NULL,
    PRIMARY KEY(account,observed_at)
);
INSERT INTO orbit_name_history SELECT id,floor(extract(epoch FROM clock_timestamp())*1000)::bigint,name FROM accounts;
CREATE FUNCTION capture_orbit_name() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='INSERT' OR NEW.name IS DISTINCT FROM OLD.name THEN
        INSERT INTO orbit_name_history(account,observed_at,name)
            VALUES(NEW.id,floor(extract(epoch FROM clock_timestamp())*1000)::bigint,NEW.name)
            ON CONFLICT(account,observed_at) DO UPDATE SET name=excluded.name;
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER orbit_name_observation AFTER INSERT OR UPDATE OF name ON accounts
    FOR EACH ROW EXECUTE FUNCTION capture_orbit_name();

-- Recover interval boundaries only where retained affiliation evidence supports
-- them. Renames within continuous membership are not fabricated joins/leaves.
WITH intervals AS (
    SELECT h.*,lag(alliance) OVER w AS previous_alliance,lag(valid_until) OVER w AS previous_until,
        lead(alliance) OVER w AS next_alliance,lead(valid_from) OVER w AS next_from
    FROM alliance_affiliation_history h
    WINDOW w AS (PARTITION BY player,epoch ORDER BY valid_from,id)
)
INSERT INTO empire_history(player,source,kind,at_ms,facts)
    SELECT h.player,'affiliation:'||h.id||':join','AllianceJoined',h.valid_from,
        jsonb_build_object('alliance',h.alliance,'name',h.name,'tag',h.tag)
    FROM intervals h JOIN empire_profiles p ON p.player=h.player AND p.epoch=h.epoch
    WHERE h.previous_alliance IS DISTINCT FROM h.alliance OR h.previous_until IS DISTINCT FROM h.valid_from;
WITH intervals AS (
    SELECT h.*,lead(alliance) OVER w AS next_alliance,lead(valid_from) OVER w AS next_from
    FROM alliance_affiliation_history h WINDOW w AS (PARTITION BY player,epoch ORDER BY valid_from,id)
)
INSERT INTO empire_history(player,source,kind,at_ms,facts)
    SELECT h.player,'affiliation:'||h.id||':leave','AllianceLeft',h.valid_until,
        jsonb_build_object('alliance',h.alliance,'name',h.name,'tag',h.tag,'reason_recorded',false)
    FROM intervals h JOIN empire_profiles p ON p.player=h.player AND p.epoch=h.epoch
    WHERE h.valid_until IS NOT NULL AND (h.next_alliance IS DISTINCT FROM h.alliance OR h.next_from IS DISTINCT FROM h.valid_until);

-- Operator corrections are append-only historical facts; originals remain intact.
CREATE TABLE empire_history_corrections (
    source uuid PRIMARY KEY,
    event uuid NOT NULL REFERENCES empire_history(id),
    at_ms bigint NOT NULL,
    reason text NOT NULL CHECK(char_length(reason) BETWEEN 1 AND 2000),
    facts jsonb NOT NULL,
    payload jsonb
);
CREATE INDEX empire_history_corrections_latest ON empire_history_corrections(event,at_ms DESC,source DESC);

-- Keep authored appearance references, not cosmetic asset bytes or entitlement
-- snapshots. A renderer resolves installed content and its normal free fallback.
CREATE TABLE orbit_appearance_history (
    player uuid NOT NULL REFERENCES empire_profiles(player),
    observed_at bigint NOT NULL,
    recipe jsonb,
    PRIMARY KEY(player,observed_at)
);
CREATE FUNCTION capture_orbit_appearance() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE stamp bigint := floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
BEGIN
    IF TG_TABLE_NAME='empire_insignias' THEN
        INSERT INTO orbit_appearance_history(player,observed_at,recipe)
            SELECT m.player,stamp,d.recipe FROM universe_memberships m
            LEFT JOIN insignia_designs d ON d.account=m.account AND d.id=NEW.design_id
            WHERE m.universe=NEW.universe AND m.account=NEW.account
            ON CONFLICT(player,observed_at) DO UPDATE SET recipe=excluded.recipe;
    ELSE
        INSERT INTO orbit_appearance_history(player,observed_at,recipe)
            SELECT m.player,stamp,NEW.recipe FROM empire_insignias e
            JOIN universe_memberships m ON m.universe=e.universe AND m.account=e.account
            WHERE e.account=NEW.account AND e.design_id=NEW.id
            ON CONFLICT(player,observed_at) DO UPDATE SET recipe=excluded.recipe;
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER orbit_equipped_appearance AFTER INSERT OR UPDATE OF design_id ON empire_insignias
    FOR EACH ROW EXECUTE FUNCTION capture_orbit_appearance();
CREATE TRIGGER orbit_design_appearance AFTER UPDATE OF recipe ON insignia_designs
    FOR EACH ROW WHEN (OLD.recipe IS DISTINCT FROM NEW.recipe) EXECUTE FUNCTION capture_orbit_appearance();
INSERT INTO orbit_appearance_history(player,observed_at,recipe)
    SELECT m.player,floor(extract(epoch FROM clock_timestamp())*1000)::bigint,d.recipe
    FROM universe_memberships m JOIN empire_insignias e ON e.universe=m.universe AND e.account=m.account
    LEFT JOIN insignia_designs d ON d.account=e.account AND d.id=e.design_id;
