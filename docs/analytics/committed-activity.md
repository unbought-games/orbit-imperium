# Committed activity v1

This optional server integration preserves meaningful-play counts and elapsed
return cohorts independently of command retention. It does not authorize command
cleanup. Current gameplay state and command receipts remain authoritative.

## Contract

Admission freezes trusted analytics property/policy/environment and the OIDC
subject in `commands.activity_policy`, using request-local scope. DNT, GPC and
`orbit_analytics_disabled=true` freeze refusal. Missing integration/request scope
and missing identity produce explicit gaps; neither implies consent. Browser SDK,
visit cookies and attribution are unnecessary. Existing command retries keep the
original admission decision. Both ordinary and paired foreground admission use
this hook. Native/direct store callers have unknown coverage unless explicitly
wrapped with trusted server configuration.

Only `done` commands with receipt status `Committed` and these actions qualify:
SetProduction, StartDemolition, StartResearch, CancelResearch, StartManufacture,
LaunchTransport, RecallFleet, StartUpgrade, CancelConstruction, World.LaunchFleet,
World.RecallMission. Presence, report management, other commands, rejected and
pending commands and scheduled events are excluded. This is the existing metric
classification, not a claim that all other actions are meaningless.

`capture_committed_activity` runs in the state/completion transaction. Its compact
payload contains world, epoch, actor, normalized action, original `at_ms`, subject
and policy. The event ID is `commands.input_id`, scoped by analytics property.
No resources, coordinates, command body, receipt body or state snapshot is copied.
`occurred_at` is the logical timestamp rendered in UTC, not commit/receipt wall time.
The generic analytics schema is `committed_activity` v1, authoritative `human_action`,
with required string properties world/epoch/actor/action (maximum 128 characters).

The capture marker and outbox insert roll back together. A repeated commit or
projection cannot add a second fact. New activity uses the existing server outbox
without the optional visit capture's 200/account/day admission limit. Activity is
excluded from that optional budget while retaining the source account foreign key.
Account deletion therefore retains existing source privacy semantics; removing an
unacknowledged activity payload records an anonymous source-deletion coverage gap. Delivery is
asynchronous: at most 100 events and 192 KiB of payload per claim, a 30-second
lease, and continuous draining while work exists. Idle/errors wait five seconds;
remote calls retain the existing two-second timeout. Quota rejection remains
pending; accepted/duplicate acknowledgements mark delivered. Schema, policy,
suppression or conflict rejection remains quarantined for explicit disposition.
The compact analytics destination deduplicates before acknowledgement and retains
activity under the existing identity retention policy, beyond detailed-event expiry.

## Outages, gaps and cleanup handoff

No remote analytics call participates in admission or commit. Remote outages,
missing acknowledgements and process restarts leave immutable source payloads
pending. `human_action` is excluded from the existing 90-day custom/navigation
source cleanup. Quarantined and undelivered facts do not expire automatically.
As with all authoritative writes, local database failure can fail a transaction;
remote analytics availability cannot. This is durable delivery, not a guarantee
of infinite disk capacity. Monitor pending/quarantined counts, oldest logical time,
queue growth and free storage. Activation must demonstrate drain throughput above
observed arrival rate, including other outbox traffic. Stop command cleanup if that
capacity gate fails. No source payload cleanup is enabled by this change.

`activity_coverage_gaps` retains anonymous daily counts by universe/epoch/reason
for qualifying commands without collection permission/identity. `activity_captured`
prevents retry double-counting of gaps. It is not permission to ignore gaps.
The analytics destination records aggregate retention/deletion gaps and exposes
expired-but-not-yet-cleaned rows separately. A gap means unavailable coverage, not
zero activity. First observed never establishes true first by itself.

Future cleanup may remove delivered source payloads after verified destination
acknowledgement and reconciliation. It must retain pending/quarantined required
facts or record an explicitly accepted coverage loss. Historical command rows
cannot be purged until historical migration, exact-key and same-cutoff metric
reconciliation, current live delivery, coverage adjudication and the separate
receipt/stream/dependency gates all pass. Completing or merging this code is not
that evidence. No journal access or command retry/expiry behavior is removed here.

## Bounded historical migration

`scripts/activity/history.py` has no production defaults. Run clients locally over
the approved read-only access route. Keep all exports and policy files private.
Use a fixed universe, epoch and UTC logical cutoff. `DATABASE_URL` is an environment
secret; neither it nor a token is passed in process arguments. Extraction uses
read-only transactions with 20-second statements and 1-second lock acquisition.

Prepare a policy file with `subjects` keyed by `issuer|subject`. Each permitted
entry contains `config: {propertyId, policyVersion, environment}`. A documented
historical permission decision is required for a legacy NULL admission policy.
Do not infer it from a current browser visit or current setting. Unknown entries
become `historical_collection_unknown` gaps. Retained admission decisions always
win, including explicit refusal. Preserve the policy-file hash as evidence.

```sh
python3 scripts/activity/history.py export --universe UUID --epoch UUID \
  --cutoff-ms MILLISECONDS --policy /private/historical-policy.json \
  --batch-size 500 --max-batches 10 --output /private/activity-export
# Re-run the exact command to resume; inspect checkpoint.json.complete.
# Separate, explicitly authorized destination writes only:
python3 scripts/activity/history.py deliver --endpoint https://analytics.example \
  --max-batches 100 --output /private/activity-export
```

Extraction pages contain minimal events and separate gaps. A checkpoint advances
only after atomic page replacement; crashes can rewrite the same page safely.
Delivery uses 100-event batches and a SQLite acknowledgement checkpoint, retained
files, stable event IDs and no redirect following. Failed/partial acknowledgements
do not mark undelivered facts successful. Repeated delivery after an uncertain
acknowledgement deduplicates at the destination. A changed acknowledged payload is
refused. Page size is capped at 1000 and invocations at 1000 batches.

Keyset extraction is a bounded series of live snapshots, **not** one historical
snapshot. Late commits behind its cursor require a fresh full pass after the
source cutoff has settled. Preserve both passes. Any scan timeout is failed
extraction; a completed page sequence alone does not prove history completeness.
Export the destination `activity` dataset at the same cutoff to JSONL, using world,
epoch, actor, action, event_id and at_ms. Flatten permitted extraction facts into
expected JSONL and run:

```sh
python3 scripts/activity/history.py reconcile --expected /private/expected.jsonl \
  --actual /private/actual.jsonl --checkpoint /private/reconcile.sqlite --max-rows 10000
```

Reconciliation uses disk indexes and checkpoints byte offsets across invocations;
exit 2 means incomplete and requires the same command again. Changed input files
require a fresh checkpoint. Only 100 example mismatches are printed per category,
with exact total mismatch counts. The result must have no missing/unexpected/changed identities; duplicate identities
are an error. Compare excluded/unknown policy gaps separately, then run baseline
and completed-week report parity at the same cutoff and with the same population
exclusions. Repeat around live/backfill overlap, drain pending/quarantined facts,
and retain a coverage checkpoint naming revisions, source snapshots, policy hash,
cutoffs, exact counts and accepted differences. Old source snapshots remain the
comparison oracle until coordinator acceptance.

## Rollout and rollback

Deploy the generic analytics schema/ingestion support and register the event schema
before enabling the producer. Prepare restricted activity source views/credentials
and source registration separately. Apply the additive game migration with bounded
lock acquisition; no old migration checksum changes. Deploy compatible API and
workers, verify live facts/gaps and drain behavior, then migrate/reconcile history
and activate reports. Rolling old writers leave explicit unverified coverage that
must be included in historical extraction. Reserve migration 0048 only if still
free at integration; renumber before any deployment if another migration lands.

Rollback to the previous application leaves additive columns/tables intact. It
stops capture; record the coverage interval and keep commands for recovery. Never
roll back by deleting queued facts or schema. Restore report readers to the old
source only while command history is still intact. No production migration,
backfill, source-view activation, retention change or purge has been performed.
