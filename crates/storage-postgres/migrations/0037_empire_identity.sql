ALTER TABLE empire_profiles
    ADD COLUMN empire_name text NOT NULL DEFAULT '' CHECK(char_length(empire_name)<=60),
    ADD COLUMN tagline text NOT NULL DEFAULT '' CHECK(char_length(tagline)<=160),
    ADD COLUMN title_id text NOT NULL DEFAULT 'commander' CHECK(title_id ~ '^[a-z0-9-]{1,64}$');

-- One grant source for all cosmetic kinds. The compatibility view keeps older
-- servers and operator inserts functional during rolling upgrades.
ALTER TABLE insignia_grants RENAME TO cosmetic_grants;
ALTER TABLE cosmetic_grants RENAME COLUMN symbol TO item_id;
ALTER TABLE cosmetic_grants ADD COLUMN kind text NOT NULL DEFAULT 'insignia' CHECK(kind ~ '^[a-z0-9-]{1,64}$');
ALTER TABLE cosmetic_grants ADD COLUMN source text NOT NULL DEFAULT 'operator' CHECK(char_length(source) BETWEEN 1 AND 200);
ALTER TABLE cosmetic_grants DROP CONSTRAINT insignia_grants_pkey;
ALTER TABLE cosmetic_grants ADD PRIMARY KEY(account,kind,item_id);
CREATE VIEW insignia_grants AS SELECT account,item_id AS symbol,granted_at,reason FROM cosmetic_grants WHERE kind='insignia' WITH LOCAL CHECK OPTION;

-- Authored observations are historical facts, not cached effective appearance.
CREATE TABLE empire_identity_history (
    player uuid NOT NULL REFERENCES empire_profiles(player),
    observed_at bigint NOT NULL,
    identity jsonb NOT NULL,
    PRIMARY KEY(player,observed_at)
);
CREATE FUNCTION capture_empire_custom_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO empire_identity_history(player,observed_at,identity)
    VALUES(NEW.player,floor(extract(epoch FROM clock_timestamp())*1000)::bigint,
        jsonb_build_object('name',NEW.empire_name,'tagline',NEW.tagline,'title_id',NEW.title_id))
    ON CONFLICT(player,observed_at) DO UPDATE SET identity=excluded.identity;
    RETURN NEW;
END $$;
CREATE TRIGGER empire_custom_identity AFTER INSERT OR UPDATE OF empire_name,tagline,title_id ON empire_profiles
    FOR EACH ROW EXECUTE FUNCTION capture_empire_custom_identity();
INSERT INTO empire_identity_history SELECT player,floor(extract(epoch FROM clock_timestamp())*1000)::bigint,
    jsonb_build_object('name',empire_name,'tagline',tagline,'title_id',title_id) FROM empire_profiles;
