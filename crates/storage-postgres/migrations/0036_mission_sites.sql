-- Dormant additive foundation: no production enrollment or issuance. All serving
-- workers must support site facts/scopes before a consumer is explicitly enabled.
-- No FK to players: historical identity and live fleet references survive empire
-- removal. Universe teardown owns final retention cleanup.
CREATE TABLE mission_sites (
    universe uuid NOT NULL REFERENCES universes(id) ON DELETE CASCADE,
    epoch uuid NOT NULL,
    id uuid NOT NULL,
    beneficiary uuid NOT NULL,
    issuance_key text NOT NULL,
    data jsonb NOT NULL,
    PRIMARY KEY (universe, id),
    UNIQUE (universe, epoch, beneficiary, issuance_key),
    CHECK (length(issuance_key) BETWEEN 1 AND 160),
    CHECK (jsonb_typeof(data) = 'object'),
    CHECK ((data #>> '{creation,issuance,universe}') IS NOT DISTINCT FROM universe::text),
    CHECK ((data #>> '{creation,issuance,epoch}') IS NOT DISTINCT FROM epoch::text),
    CHECK ((data #>> '{creation,issuance,beneficiary}') IS NOT DISTINCT FROM beneficiary::text),
    CHECK ((data #>> '{creation,issuance,key}') IS NOT DISTINCT FROM issuance_key)
);
CREATE INDEX mission_sites_beneficiary ON mission_sites (universe, epoch, beneficiary, id);
