-- Return causes are causal facts, not visibility flags. Retained commitments and
-- immutable journals are not rewritten. Never infer recall from timestamps or
-- expiring mission reports. Only a successful transition from Outbound to the
-- exact retained Returning revision proves the cause of a legacy deployment.
WITH evidence AS (
    SELECT f.id,
           CASE
             WHEN j.input #>> '{payload,Command,type}' = 'World'
              AND j.input #>> '{payload,Command,action,type}' = 'RecallMission'
              AND j.input #>> '{payload,Command,action,fleet}' = f.id::text
               THEN 'VoluntaryRecall'
             WHEN j.input #>> '{payload,Event,type}' = 'FleetLegDue'
              AND j.input #>> '{payload,Event,fleet}' = f.id::text
              AND j.input #>> '{payload,Event,expected_leg}' = 'Outbound'
               THEN 'InvalidTarget'
           END AS reason
    FROM mission_fleets f
    JOIN transition_journal j ON j.universe = f.universe
    WHERE f.data->>'leg' = 'Returning'
      AND f.data #>> '{intent,mission}' = 'Deploy'
      AND NOT (f.data ? 'return_reason')
      AND j.facts #>> ARRAY['world','records','fleets',f.id::text,'leg'] = 'Outbound'
      AND j.outcome #> ARRAY['Applied','world','records','fleets',f.id::text] = f.data
), classified AS (
    SELECT id, min(reason) AS reason FROM evidence
    GROUP BY id HAVING count(DISTINCT reason) = 1 AND bool_and(reason IS NOT NULL)
)
UPDATE mission_fleets f
SET data = jsonb_set(f.data, '{return_reason}', to_jsonb(c.reason))
FROM classified c WHERE f.id = c.id;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM mission_fleets
        WHERE data->>'leg' = 'Returning'
          AND data #>> '{intent,mission}' = 'Deploy'
          AND (data->>'return_reason' IS NULL OR data->>'return_reason' NOT IN ('VoluntaryRecall','InvalidTarget'))
    ) THEN
        RAISE EXCEPTION 'Unclassified active returning deployment: restore conclusive transition_journal evidence before migrating; timing and reports are not proof';
    END IF;
END $$;

ALTER TABLE mission_fleets ADD CONSTRAINT mission_return_reason_valid CHECK (
    (NOT (data ? 'return_reason') OR (
        data->>'return_reason' IN ('VoluntaryRecall','InvalidTarget','MissionComplete')
        AND data->>'leg' IN ('Returning','Returned','Destroyed')
        AND (data #>> '{intent,mission}' <> 'Deploy' OR data->>'return_reason' <> 'MissionComplete')
    )) IS TRUE
    AND (data->>'leg' <> 'Returning' OR data #>> '{intent,mission}' <> 'Deploy'
         OR data->>'return_reason' IN ('VoluntaryRecall','InvalidTarget')) IS TRUE
);
