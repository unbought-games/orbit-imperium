WITH picked AS MATERIALIZED (
   SELECT ctid FROM game_updates WHERE created_at < statement_timestamp()-interval '7 days'
   ORDER BY created_at LIMIT 1000 FOR UPDATE SKIP LOCKED
), removed AS (
   DELETE FROM game_updates WHERE ctid IN (SELECT ctid FROM picked)
   RETURNING universe,epoch,player,position,created_at
), floors AS (
   SELECT universe,epoch,player,max(position) AS floor FROM removed GROUP BY universe,epoch,player
), advanced AS (
   UPDATE game_update_heads h SET retired_through=greatest(h.retired_through,f.floor)
   FROM floors f WHERE (h.universe,h.epoch,h.player)=(f.universe,f.epoch,f.player)
) SELECT count(*),coalesce(floor(extract(epoch FROM (statement_timestamp()-min(created_at)))*1000)::bigint,0)
FROM removed
