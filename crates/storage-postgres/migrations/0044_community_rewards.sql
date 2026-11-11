-- Source evidence is independent of service availability and program activation.
CREATE TABLE community_participation (
    account uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    universe uuid NOT NULL,
    epoch uuid NOT NULL,
    player uuid NOT NULL,
    date date NOT NULL,
    input_id uuid NOT NULL,
    recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY(account, universe, date)
);
CREATE TABLE community_outbox (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    fact_key text NOT NULL UNIQUE,
    kind text NOT NULL,
    occurred_at text NOT NULL,
    payload jsonb NOT NULL,
    state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','delivered','quarantined')),
    attempts integer NOT NULL DEFAULT 0,
    retry_at timestamptz NOT NULL DEFAULT now(),
    lease uuid,
    reason text,
    acknowledged_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX community_outbox_pending ON community_outbox(retry_at,id) WHERE state='pending';
CREATE TABLE community_award_receipts (
    award_id text PRIMARY KEY,
    account uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    award_payload jsonb NOT NULL,
    acknowledged_at timestamptz,
    granted_at timestamptz NOT NULL DEFAULT now()
);
-- Every award source survives, including sources that did not create the first grant.
CREATE TABLE cosmetic_grant_sources (
    account uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    kind text NOT NULL,
    item_id text NOT NULL,
    source text NOT NULL,
    reason text NOT NULL,
    granted_at timestamptz DEFAULT now(),
    revoked_at timestamptz,
    revocation_id text,
    PRIMARY KEY(account,kind,item_id,source)
);
INSERT INTO cosmetic_grant_sources(account,kind,item_id,source,reason,granted_at)
    SELECT account,kind,item_id,source,reason,granted_at FROM cosmetic_grants;
-- Immutable achievement evidence, not a mutable count or eligibility cache.
CREATE TABLE community_alliance_snapshots (
    universe uuid NOT NULL,
    epoch uuid NOT NULL,
    alliance uuid NOT NULL,
    milestone_id text NOT NULL,
    source_id text NOT NULL UNIQUE,
    reached_at timestamptz NOT NULL,
    evidence jsonb NOT NULL,
    PRIMARY KEY(universe,epoch,alliance,milestone_id)
);
CREATE TABLE community_callback_receipts (
    operation_id text PRIMARY KEY,
    intent jsonb NOT NULL,
    result jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE community_worker_observations (
    worker_id uuid PRIMARY KEY,
    observed_at timestamptz NOT NULL,
    succeeded_at timestamptz
);
-- Lower bound for legacy profiles whose original join timestamp was never retained.
-- This records installation time, not a fabricated player join date.
CREATE TABLE community_evidence_installation (
    singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
    installed_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO community_evidence_installation(singleton) VALUES(true);
CREATE TABLE community_alliance_awards (
    universe uuid NOT NULL,
    epoch uuid NOT NULL,
    alliance uuid NOT NULL,
    honor_id text NOT NULL,
    reward_id text NOT NULL,
    kind text NOT NULL,
    item_id text NOT NULL,
    rule_version text NOT NULL,
    reached_at timestamptz NOT NULL,
    award_payload jsonb NOT NULL,
    PRIMARY KEY(universe,epoch,alliance,honor_id,reward_id)
);
CREATE INDEX community_alliance_awards_owner ON community_alliance_awards(alliance);
CREATE INDEX community_outbox_quarantined ON community_outbox(id) WHERE state='quarantined';
CREATE INDEX community_receipts_pending ON community_award_receipts(granted_at,award_id) WHERE acknowledged_at IS NULL;

-- Preserve sources inserted by compatibility views or older trusted callers too.
CREATE FUNCTION community_capture_cosmetic_source() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO cosmetic_grant_sources(account,kind,item_id,source,reason,granted_at)
    VALUES(NEW.account,NEW.kind,NEW.item_id,NEW.source,NEW.reason,NEW.granted_at)
    ON CONFLICT DO NOTHING;
    RETURN NEW;
END $$;
CREATE TRIGGER community_cosmetic_source AFTER INSERT ON cosmetic_grants
FOR EACH ROW EXECUTE FUNCTION community_capture_cosmetic_source();

CREATE UNIQUE INDEX community_revoked_award_source ON cosmetic_grant_sources(source) WHERE revocation_id IS NOT NULL;
