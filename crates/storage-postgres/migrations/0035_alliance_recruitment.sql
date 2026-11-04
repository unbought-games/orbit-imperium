-- Only authored recruitment preferences and the current invitation token are stored.
ALTER TABLE alliances ADD COLUMN recruitment_profile jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(recruitment_profile) = 'object');
ALTER TABLE alliances ADD COLUMN invitation uuid;
CREATE UNIQUE INDEX alliance_invitation_unique ON alliances(invitation) WHERE invitation IS NOT NULL;
