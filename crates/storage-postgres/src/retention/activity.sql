WITH picked AS MATERIALIZED (
    SELECT event_id,acknowledged_at FROM analytics_delivery
    WHERE state='delivered' AND fact_key LIKE 'activity:%'
      AND acknowledged_at <= to_timestamp($1::bigint/1000.0)-interval '7 days'
    ORDER BY acknowledged_at,event_id LIMIT 128 FOR UPDATE SKIP LOCKED
), removed AS (
    DELETE FROM analytics_delivery WHERE event_id IN (SELECT event_id FROM picked)
)
SELECT count(*), coalesce(max($1-floor(extract(epoch FROM acknowledged_at)*1000)::bigint),0)
FROM picked
