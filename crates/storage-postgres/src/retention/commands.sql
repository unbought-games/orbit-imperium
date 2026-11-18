-- Admission holds the runtime row FOR SHARE through parent resolution and the
-- rate count. The caller holds the conflicting lock and samples time after it.
WITH candidates AS MATERIALIZED (
    SELECT c.input_id, c.retention_since
    FROM commands c
    WHERE c.universe=$1 AND c.done
      AND c.retention_since <= to_timestamp($2::bigint/1000.0)-interval '7 days'
      AND (c.retention_since,c.input_id) > ($4::text::timestamptz,$5)
    ORDER BY c.retention_since,c.input_id LIMIT 512
), picked AS MATERIALIZED (
    SELECT c.input_id, pair.presence_input, c.retention_since AS since
    FROM candidates k JOIN commands c ON c.input_id=k.input_id
    LEFT JOIN presence_pairs pair ON pair.gameplay_input=c.input_id
    LEFT JOIN commands p ON p.input_id=pair.presence_input
    WHERE c.universe=$1 AND c.done AND c.retention_since <= to_timestamp($2::bigint/1000.0)-interval '7 days'
      AND NOT EXISTS (SELECT FROM presence_pairs WHERE presence_input=c.input_id)
      AND (pair.gameplay_input IS NULL OR
           (p.done AND (p.universe,p.epoch,p.actor)=(c.universe,c.epoch,c.actor)
            AND p.retention_since <= to_timestamp($2::bigint/1000.0)-interval '7 days'))
      AND c.at_ms <= $2-60000 AND (p.at_ms IS NULL OR p.at_ms <= $2-60000)
      AND command_deadline_ms(c.command_id,$3) <= $2-3600000
      AND (p.input_id IS NULL OR
           uuid_send(p.command_id)=set_byte(uuid_send(c.command_id),0,get_byte(uuid_send(c.command_id),0) # 128)
           OR command_deadline_ms(p.command_id,$3) <= $2-3600000)
      AND NOT EXISTS (
          SELECT FROM (VALUES (c.input_id),(p.input_id)) member(id)
          WHERE EXISTS (SELECT FROM game_updates d WHERE (d.universe,d.epoch,d.player,d.input_id,d.kind)=
                            (c.universe,c.epoch,c.actor,member.id,'outcome'))
             OR EXISTS (SELECT FROM input_scopes s WHERE s.universe=c.universe AND s.input_id=member.id)
             OR EXISTS (SELECT FROM execution_scopes s WHERE s.universe=c.universe AND s.claim_input=member.id)
             OR EXISTS (SELECT FROM universe_runtime r WHERE r.universe=c.universe AND r.claim_input=member.id)
             OR EXISTS (SELECT FROM analytics_delivery d WHERE d.event_id=member.id AND d.state<>'delivered')
      )
    ORDER BY k.retention_since,k.input_id LIMIT 128 FOR UPDATE OF c SKIP LOCKED
), links AS (
    DELETE FROM presence_pairs l USING picked k WHERE l.gameplay_input=k.input_id
), removed AS (
    DELETE FROM commands WHERE input_id IN (
        SELECT input_id FROM picked UNION ALL SELECT presence_input FROM picked WHERE presence_input IS NOT NULL
    ) RETURNING input_id
), scan_end AS (
    SELECT retention_since::text AS stamp,input_id AS id
    FROM candidates ORDER BY retention_since,input_id OFFSET 511
)
SELECT count(*), coalesce(max($2-floor(extract(epoch FROM since)*1000)::bigint),0),
       (SELECT stamp FROM scan_end),(SELECT id FROM scan_end)
FROM picked
