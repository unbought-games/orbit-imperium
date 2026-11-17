SET LOCAL lock_timeout='2s';
-- Admission freezes the server-owned collection decision, independently of any SDK.
-- NULL denotes legacy/unknown coverage, never implicit consent.
ALTER TABLE commands ADD COLUMN activity_policy jsonb;
ALTER TABLE commands ADD COLUMN activity_captured boolean NOT NULL DEFAULT false;
CREATE TABLE activity_coverage_gaps (
 universe uuid NOT NULL, epoch uuid NOT NULL, day bigint NOT NULL,
 reason text NOT NULL, events bigint NOT NULL,
 PRIMARY KEY(universe,epoch,day,reason)
);
CREATE FUNCTION activity_is_meaningful(i jsonb) RETURNS boolean
 LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
 SELECT COALESCE(i#>>'{payload,Command,type}' IN
 ('SetProduction','StartDemolition','StartResearch','CancelResearch','StartManufacture','LaunchTransport','RecallFleet','StartUpgrade','CancelConstruction')
 OR (i#>>'{payload,Command,type}'='World' AND i#>>'{payload,Command,action,type}' IN ('LaunchFleet','RecallMission')),false)
$$;
-- Both live commits and bounded historical reconciliation use this exact projection.
CREATE FUNCTION capture_committed_activity(input_key uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE c commands; p jsonb; gap_reason text; payload jsonb;
BEGIN
 UPDATE commands SET activity_captured=true WHERE input_id=input_key AND done AND NOT activity_captured RETURNING * INTO c;
 IF NOT FOUND OR c.receipt->>'status' IS DISTINCT FROM 'Committed' OR NOT activity_is_meaningful(c.input) THEN RETURN; END IF;
 p := c.activity_policy;
 gap_reason := CASE WHEN p IS NULL THEN 'collection_unknown' ELSE p->>'reason' END;
 IF gap_reason IS NOT NULL THEN
  INSERT INTO activity_coverage_gaps VALUES(c.universe,c.epoch,c.at_ms/86400000,gap_reason,1)
  ON CONFLICT(universe,epoch,day,reason) DO UPDATE SET events=activity_coverage_gaps.events+1;
  RETURN;
 END IF;
 IF p#>>'{config,propertyId}' IS NULL OR p->'subject' IS NULL THEN RAISE EXCEPTION 'Invalid activity policy'; END IF;
 payload := jsonb_build_object(
 'event_id',c.input_id,'property_id',p#>>'{config,propertyId}','name','committed_activity','schema_version',1,
 'producer','server','category','human_action',
 'occurred_at',to_char(to_timestamp(c.at_ms/1000.0) AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
 'clock','game','logical_time',c.at_ms::text,'subject',p->'subject',
 'context',jsonb_build_object('environment',p#>>'{config,environment}'),
 'collection',jsonb_build_object('profile','identified','policy_version',(p#>>'{config,policyVersion}')::integer,'consent',true,'sample_rate',1,'dropped_events',0),
 'properties',jsonb_build_object('world',c.universe::text,'epoch',c.epoch::text,'actor',c.actor::text,
 'action',CASE WHEN c.input#>>'{payload,Command,type}'='World' THEN 'World.'||(c.input#>>'{payload,Command,action,type}') ELSE c.input#>>'{payload,Command,type}' END));
 INSERT INTO analytics_delivery(event_id,fact_key,account,payload)
 VALUES(c.input_id,'activity:'||c.input_id::text,NULL,payload)
 ON CONFLICT(event_id) DO NOTHING;
END $$;
