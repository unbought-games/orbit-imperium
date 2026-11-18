WITH picked AS MATERIALIZED (
    SELECT e.id,e.retention_since FROM scheduled_events e
    WHERE e.universe=$1 AND (e.done OR e.cancelled)
      AND e.retention_since <= to_timestamp($2::bigint/1000.0)-interval '7 days'
      AND NOT EXISTS (SELECT FROM input_scopes s WHERE s.universe=e.universe AND s.input_id=e.id)
      AND NOT EXISTS (SELECT FROM execution_scopes s WHERE s.universe=e.universe AND s.claim_input=e.id)
      AND NOT EXISTS (SELECT FROM universe_runtime r WHERE r.universe=e.universe AND r.claim_input=e.id)
    ORDER BY e.retention_since,e.id LIMIT 128 FOR UPDATE SKIP LOCKED
), removed AS (
    DELETE FROM scheduled_events WHERE id IN (SELECT id FROM picked)
)
SELECT count(*), coalesce(max($2-floor(extract(epoch FROM retention_since)*1000)::bigint),0)
FROM picked
