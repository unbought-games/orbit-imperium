CREATE TABLE analytics_delivery (
 event_id uuid PRIMARY KEY, fact_key text NOT NULL UNIQUE,
 account uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 payload jsonb NOT NULL CHECK (octet_length(payload::text)<=8192),
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','delivered','quarantined')),
 attempts integer NOT NULL DEFAULT 0, retry_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now(), acknowledged_at timestamptz, reason text
);
CREATE INDEX analytics_delivery_pending ON analytics_delivery(retry_at) WHERE state='pending';
CREATE VIEW analytics_delivery_coverage AS SELECT state,count(*) AS events,min(created_at) AS oldest FROM analytics_delivery GROUP BY state;

CREATE INDEX analytics_delivery_account_time ON analytics_delivery(account,created_at);
CREATE TABLE analytics_coverage_gaps (
 recorded_at timestamptz NOT NULL DEFAULT now(),
 events bigint NOT NULL, oldest timestamptz NOT NULL, newest timestamptz NOT NULL,
 reason text NOT NULL
);
