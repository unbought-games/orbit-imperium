-- Fresh database baseline. Earlier releases require a database reset.
-- Create the current schema directly; world creation remains an application operation.

CREATE TABLE accounts (id uuid PRIMARY KEY, name text UNIQUE NOT NULL, password_hash text NOT NULL);
CREATE TABLE sessions (digest text PRIMARY KEY, account uuid NOT NULL REFERENCES accounts, csrf text NOT NULL, expires_at bigint NOT NULL);
CREATE TABLE rulesets (hash text PRIMARY KEY, id text NOT NULL, profile jsonb NOT NULL);
CREATE TABLE universes (id uuid PRIMARY KEY, epoch uuid NOT NULL, development boolean NOT NULL, speed integer NOT NULL CHECK(speed BETWEEN 1 AND 100), started_at bigint NOT NULL, profile_hash text NOT NULL REFERENCES rulesets);
CREATE TABLE universe_memberships (universe uuid REFERENCES universes ON DELETE CASCADE, account uuid REFERENCES accounts, player uuid NOT NULL, PRIMARY KEY(universe,account), UNIQUE(universe,player));
CREATE TABLE players (id uuid PRIMARY KEY, universe uuid NOT NULL REFERENCES universes ON DELETE CASCADE);
CREATE TABLE bodies (id uuid PRIMARY KEY, universe uuid NOT NULL REFERENCES universes ON DELETE CASCADE, owner uuid NOT NULL REFERENCES players, kind text NOT NULL, galaxy integer NOT NULL, system integer NOT NULL, position integer NOT NULL, fields bigint NOT NULL CHECK(fields BETWEEN 0 AND 4294967295), max_temperature integer NOT NULL, amounts jsonb NOT NULL, carry jsonb NOT NULL, checkpoint_at bigint NOT NULL, revision bigint NOT NULL DEFAULT 0, UNIQUE(universe,galaxy,system,position,kind));
-- Explicit capacities for profiles without storage buildings. Current profiles derive capacity.
CREATE TABLE legacy_body_capacities (body uuid PRIMARY KEY REFERENCES bodies ON DELETE CASCADE, capacity jsonb NOT NULL);
CREATE TABLE building_levels (body uuid REFERENCES bodies ON DELETE CASCADE, building text NOT NULL, level bigint NOT NULL CHECK(level BETWEEN 0 AND 4294967295), PRIMARY KEY(body,building));
CREATE TABLE inventories (body uuid REFERENCES bodies ON DELETE CASCADE, owner uuid REFERENCES players, item jsonb NOT NULL, count bigint NOT NULL CHECK(count>=0), revision bigint NOT NULL DEFAULT 0, PRIMARY KEY(body,owner,item));
CREATE TABLE viewer_heads (universe uuid REFERENCES universes ON DELETE CASCADE, player uuid REFERENCES players, revision bigint NOT NULL DEFAULT 0, PRIMARY KEY(universe,player));

CREATE TABLE universe_runtime (universe uuid PRIMARY KEY REFERENCES universes ON DELETE CASCADE, frontier bigint NOT NULL, next_sequence bigint NOT NULL DEFAULT 1, cursor bigint NOT NULL DEFAULT 0, fence bigint NOT NULL DEFAULT 0, claim_input uuid, claim_owner uuid, claim_token uuid, lease_until bigint, blocked text);
CREATE TABLE collection_heads (universe uuid REFERENCES universes ON DELETE CASCADE, kind text NOT NULL, key uuid NOT NULL, revision bigint NOT NULL DEFAULT 0, PRIMARY KEY(universe,kind,key));
CREATE TABLE constructions (id uuid PRIMARY KEY, universe uuid REFERENCES universes ON DELETE CASCADE, body uuid NOT NULL REFERENCES bodies, owner uuid NOT NULL REFERENCES players, status text NOT NULL, generation bigint NOT NULL, revision bigint NOT NULL, building text NOT NULL, target_level bigint NOT NULL CHECK(target_level BETWEEN 0 AND 4294967295), paid jsonb NOT NULL, profile_hash text NOT NULL REFERENCES rulesets, terms_hash text NOT NULL, started_at bigint NOT NULL, due_at bigint NOT NULL, progression jsonb);
CREATE UNIQUE INDEX one_active_construction ON constructions(body) WHERE status='Active';
CREATE TABLE commands (universe uuid REFERENCES universes ON DELETE CASCADE, epoch uuid NOT NULL, actor uuid NOT NULL REFERENCES players, command_id uuid NOT NULL, input_id uuid UNIQUE NOT NULL, intent_hash text NOT NULL, at_ms bigint NOT NULL, sequence bigint NOT NULL, input jsonb NOT NULL, receipt jsonb NOT NULL, done boolean NOT NULL DEFAULT false, PRIMARY KEY(universe,epoch,actor,command_id));
CREATE INDEX command_head ON commands(universe,at_ms,sequence) WHERE NOT done;
CREATE TABLE scheduled_events (id uuid PRIMARY KEY, universe uuid NOT NULL REFERENCES universes ON DELETE CASCADE, at_ms bigint NOT NULL, sequence bigint NOT NULL, input jsonb NOT NULL, event jsonb NOT NULL, done boolean NOT NULL DEFAULT false, cancelled boolean NOT NULL DEFAULT false);
CREATE INDEX event_head ON scheduled_events(universe,at_ms,sequence) WHERE NOT done AND NOT cancelled;
CREATE TABLE transition_journal (universe uuid REFERENCES universes ON DELETE CASCADE, cursor bigint NOT NULL, input_id uuid UNIQUE NOT NULL, input jsonb NOT NULL, facts jsonb NOT NULL, outcome jsonb NOT NULL, PRIMARY KEY(universe,cursor));
CREATE TABLE fleets (id uuid PRIMARY KEY, universe uuid NOT NULL REFERENCES universes ON DELETE CASCADE, owner uuid NOT NULL REFERENCES players, origin uuid NOT NULL, target uuid NOT NULL, target_owner uuid NOT NULL, target_kind text NOT NULL, payload jsonb NOT NULL, paid_fuel bigint NOT NULL CHECK(paid_fuel>=0), profile_hash text NOT NULL REFERENCES rulesets, terms_hash text NOT NULL, launched_at bigint NOT NULL, duration bigint NOT NULL CHECK(duration>0), due_at bigint NOT NULL, generation bigint NOT NULL, status text NOT NULL CHECK(status IN ('Outbound','Returning','Completed')), revision bigint NOT NULL);
CREATE TABLE fleet_ships (fleet uuid REFERENCES fleets ON DELETE CASCADE, owner uuid NOT NULL REFERENCES players, ship_type text NOT NULL, count bigint NOT NULL CHECK(count>0), PRIMARY KEY(fleet,owner,ship_type));
CREATE TABLE reports (id uuid PRIMARY KEY, universe uuid NOT NULL REFERENCES universes ON DELETE CASCADE, fleet uuid NOT NULL REFERENCES fleets, kind text NOT NULL, at_ms bigint NOT NULL, origin uuid NOT NULL, target uuid NOT NULL, cargo jsonb NOT NULL);
CREATE TABLE report_recipients (report uuid REFERENCES reports ON DELETE CASCADE, player uuid NOT NULL REFERENCES players, PRIMARY KEY(report,player));
CREATE INDEX fleet_active_owner ON fleets(universe,owner,id) WHERE status<>'Completed';

CREATE TABLE research_levels (owner uuid REFERENCES players ON DELETE CASCADE, research text NOT NULL, level bigint NOT NULL CHECK(level BETWEEN 0 AND 4294967295), revision bigint NOT NULL DEFAULT 0, PRIMARY KEY(owner,research));

-- Private creation evidence, never returned by player projections.
CREATE TABLE mvp_bootstraps (universe uuid PRIMARY KEY REFERENCES universes ON DELETE CASCADE, secret bytea NOT NULL CHECK(octet_length(secret)=32), manifest jsonb NOT NULL);

CREATE TABLE production_settings (body uuid PRIMARY KEY REFERENCES bodies, data jsonb NOT NULL, revision bigint NOT NULL CHECK(revision>=0));
CREATE TABLE research_operations (id uuid PRIMARY KEY, universe uuid NOT NULL REFERENCES universes, owner uuid NOT NULL REFERENCES players, body uuid NOT NULL REFERENCES bodies, data jsonb NOT NULL, CONSTRAINT research_status_valid CHECK (((data->>'status') IN ('Active','Completed','Cancelled')) IS TRUE), CONSTRAINT research_revision_valid CHECK ((jsonb_typeof(data->'revision')='number' AND (data->>'revision')::bigint>=0) IS TRUE));
CREATE UNIQUE INDEX one_active_research ON research_operations(owner) WHERE data->>'status'='Active';
CREATE TABLE manufacturing_batches (id uuid PRIMARY KEY, universe uuid NOT NULL REFERENCES universes, owner uuid NOT NULL REFERENCES players, body uuid NOT NULL REFERENCES bodies, queue_sequence bigint NOT NULL, data jsonb NOT NULL, CONSTRAINT manufacturing_status_valid CHECK (((data->>'status') IN ('Active','Completed')) IS TRUE), CONSTRAINT manufacturing_revision_valid CHECK ((jsonb_typeof(data->'revision')='number' AND (data->>'revision')::bigint>=0) IS TRUE), UNIQUE(body,queue_sequence));
CREATE INDEX active_manufacturing ON manufacturing_batches(body,queue_sequence) WHERE data->>'status'='Active';

CREATE TABLE world_heads (universe uuid PRIMARY KEY REFERENCES universes, revision bigint NOT NULL DEFAULT 0);
CREATE TABLE player_policies (universe uuid REFERENCES universes, id uuid PRIMARY KEY REFERENCES players, data jsonb NOT NULL);
CREATE TABLE body_activity (universe uuid REFERENCES universes, id uuid PRIMARY KEY REFERENCES bodies, data jsonb NOT NULL);
CREATE TABLE asset_lots (universe uuid REFERENCES universes, key text NOT NULL, data jsonb NOT NULL, PRIMARY KEY(universe,key));
CREATE TABLE mission_fleets (universe uuid REFERENCES universes, id uuid PRIMARY KEY, owner uuid REFERENCES players, data jsonb NOT NULL, CONSTRAINT mission_leg_valid CHECK (((data->>'leg') IN ('Outbound','Returning','Returned','Destroyed')) IS TRUE));
CREATE INDEX mission_active ON mission_fleets(universe,id) WHERE (data->>'leg') IN ('Outbound','Returning');
CREATE TABLE debris_fields (universe uuid REFERENCES universes, id uuid PRIMARY KEY, data jsonb NOT NULL);
CREATE TABLE presence_pairs (universe uuid REFERENCES universes, presence_input uuid UNIQUE NOT NULL, gameplay_input uuid PRIMARY KEY, data jsonb NOT NULL, succeeded boolean NOT NULL DEFAULT false);
CREATE TABLE mission_reports (universe uuid REFERENCES universes, id uuid PRIMARY KEY, event uuid NOT NULL, kind text NOT NULL, at_ms bigint NOT NULL, data jsonb NOT NULL, UNIQUE(universe,event,kind,id));
CREATE TABLE mission_report_heads (universe uuid REFERENCES universes, recipient uuid PRIMARY KEY REFERENCES players, revision bigint NOT NULL DEFAULT 0);
CREATE TABLE mission_report_recipients (report uuid REFERENCES mission_reports, recipient uuid REFERENCES players, created_revision bigint NOT NULL, read boolean NOT NULL DEFAULT false, hidden boolean NOT NULL DEFAULT false, PRIMARY KEY(report,recipient));
CREATE INDEX mission_history ON mission_report_recipients(recipient,created_revision,report);
CREATE TABLE world_evidence (universe uuid REFERENCES universes, input uuid PRIMARY KEY, deltas jsonb NOT NULL, audits jsonb NOT NULL);
CREATE TABLE mission_report_cursors (token uuid PRIMARY KEY, binding jsonb NOT NULL, kind text, include_hidden boolean NOT NULL, cut bigint NOT NULL, last_at bigint NOT NULL, last_id uuid NOT NULL);
