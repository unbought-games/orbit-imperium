WITH bounds AS MATERIALIZED (
   SELECT least(coalesce($6::bigint,floor(extract(epoch FROM statement_timestamp())*1000)::bigint),
                         floor(extract(epoch FROM statement_timestamp())*1000)::bigint) AS sweep_at
), candidates AS MATERIALIZED (
   SELECT ctid,universe,epoch,player,position,created_at FROM game_updates
   WHERE created_at < to_timestamp((SELECT sweep_at FROM bounds)/1000.0)-interval '7 days'
     AND (created_at,universe,epoch,player,position) > ($1::text::timestamptz,$2,$3,$4,$5)
   ORDER BY created_at,universe,epoch,player,position LIMIT 1000
), locked_heads AS MATERIALIZED (
   SELECT h.universe,h.epoch,h.player FROM game_update_heads h
   JOIN (SELECT DISTINCT universe,epoch,player FROM candidates) c
     ON (h.universe,h.epoch,h.player)=(c.universe,c.epoch,c.player)
   ORDER BY h.universe,h.epoch,h.player FOR NO KEY UPDATE OF h SKIP LOCKED
), picked AS MATERIALIZED (
   SELECT d.ctid FROM candidates c JOIN locked_heads h
     ON (h.universe,h.epoch,h.player)=(c.universe,c.epoch,c.player)
   JOIN game_updates d ON d.ctid=c.ctid
   ORDER BY c.created_at FOR UPDATE OF d SKIP LOCKED
), removed AS (
   DELETE FROM game_updates WHERE ctid IN (SELECT ctid FROM picked)
   RETURNING universe,epoch,player,position,created_at
), floors AS (
   SELECT universe,epoch,player,max(position) AS floor FROM removed GROUP BY universe,epoch,player
), advanced AS (
   UPDATE game_update_heads h SET retired_through=greatest(h.retired_through,f.floor)
   FROM floors f WHERE (h.universe,h.epoch,h.player)=(f.universe,f.epoch,f.player)
), scan_end AS (
   SELECT created_at::text AS stamp,universe,epoch,player,position FROM candidates
   ORDER BY created_at,universe,epoch,player,position OFFSET 999
) SELECT count(*),coalesce(floor(extract(epoch FROM (statement_timestamp()-min(created_at)))*1000)::bigint,0),
         (SELECT stamp FROM scan_end),(SELECT universe FROM scan_end),(SELECT epoch FROM scan_end),
         (SELECT player FROM scan_end),(SELECT position FROM scan_end),(SELECT sweep_at FROM bounds)
FROM removed
