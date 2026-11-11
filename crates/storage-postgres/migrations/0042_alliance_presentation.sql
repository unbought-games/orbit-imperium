-- Authored presentation only. Public visibility and media usage are derived.
CREATE TABLE alliance_presentation (
    alliance uuid PRIMARY KEY REFERENCES alliances(id) ON DELETE CASCADE,
    schema_version integer NOT NULL CHECK(schema_version > 0),
    identity jsonb NOT NULL CHECK(jsonb_typeof(identity)='object' AND octet_length(identity::text)<=16384),
    hall jsonb NOT NULL CHECK(jsonb_typeof(hall)='object' AND octet_length(hall::text)<=65536),
    active_template text NOT NULL CHECK(length(active_template) BETWEEN 1 AND 64)
);
CREATE TABLE alliance_template_documents (
    alliance uuid NOT NULL REFERENCES alliances(id) ON DELETE CASCADE,
    template_id text NOT NULL CHECK(length(template_id) BETWEEN 1 AND 64),
    schema_version integer NOT NULL CHECK(schema_version > 0),
    content jsonb NOT NULL CHECK(jsonb_typeof(content)='object' AND octet_length(content::text)<=65536),
    PRIMARY KEY(alliance,template_id)
);
-- No live-alliance FK: tombstones must survive disband/reset for blob cleanup.
CREATE TABLE alliance_media (
    id uuid PRIMARY KEY,
    universe uuid NOT NULL,
    epoch uuid NOT NULL,
    alliance uuid NOT NULL,
    uploader uuid NOT NULL,
    filename text NOT NULL CHECK(char_length(filename)<=160),
    declared_bytes bigint NOT NULL CHECK(declared_bytes>0),
    created_at bigint NOT NULL,
    expires_at bigint NOT NULL,
    state text NOT NULL CHECK(state IN ('reserved','ready','deleting','deleted')),
    receipt jsonb CHECK(receipt IS NULL OR jsonb_typeof(receipt)='object'),
    deleted_at bigint
);
CREATE INDEX alliance_media_owner ON alliance_media(alliance,state);
CREATE INDEX alliance_media_cleanup ON alliance_media(state,expires_at);
-- Deletion intent is recorded transactionally even in reset/account cleanup paths.
CREATE FUNCTION retire_alliance_media() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE alliance_media SET state='deleting',deleted_at=floor(extract(epoch FROM clock_timestamp())*1000)::bigint
    WHERE alliance=OLD.id AND state NOT IN ('deleted','deleting');
  RETURN OLD;
END;
$$;
CREATE TRIGGER alliance_media_disband BEFORE DELETE ON alliances
FOR EACH ROW EXECUTE FUNCTION retire_alliance_media();

ALTER TABLE empire_arrivals ADD COLUMN recruitment jsonb CHECK(recruitment IS NULL OR jsonb_typeof(recruitment)='object');
