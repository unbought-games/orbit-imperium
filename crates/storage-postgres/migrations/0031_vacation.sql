-- Coordinated worker upgrade. Historical journal payloads remain byte-for-byte intact.
-- An old operator flag has no entry time. Preserve protection and start its real
-- 48-hour interval at this migration boundary. Settlement splits old checkpoints
-- at entered_at, retaining all pre-boundary production.
WITH boundary AS (
    SELECT p.universe, p.id,
        greatest(floor(extract(epoch FROM statement_timestamp()) * 1000)::bigint,
                 r.frontier,
                 coalesce((SELECT max(b.checkpoint_at) FROM bodies b
                           WHERE b.universe=p.universe AND b.owner=p.id), 0)) AS at_ms
    FROM player_policies p JOIN universe_runtime r ON r.universe=p.universe
    WHERE p.data->'vacation'='true'::jsonb
)
UPDATE player_policies p
SET data=jsonb_set(jsonb_set(p.data, '{vacation}',
    jsonb_build_object('entered_at', b.at_ms, 'policy_hash', p.data->'policy_hash')),
    '{revision}', to_jsonb((p.data->>'revision')::bigint+1))
FROM boundary b WHERE p.universe=b.universe AND p.id=b.id;
