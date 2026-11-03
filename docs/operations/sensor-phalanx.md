# Sensor Phalanx deployment and activation

Sensor Phalanx follows the existing [rules rollout](rules-updates.md#official-production-rollout):
deploy the image to every API, worker and operator process, then run that image's
normal rules upgrade. Deployment tooling/operator owns rollout completion. Orbit
does not detect replica versions or require a capability registry, attestation,
credential change, override flag or separate phalanx preparation command.

Standard rules now enable `world.phalanx: "sensor-phalanx-v1"` and moon-only
Sensor Phalanx construction. Lunar Base level 1 is required. Level 1 costs
20,000 metal, 40,000 crystal and 20,000 deuterium; each level doubles the cost.
Use the normal commands after completing deployment everywhere:

```sh
orbit rules upgrade --dry-run
orbit rules upgrade
```

Ordinary deployment with scans disabled needs no fleet drain, journal traversal,
return-cause backfill or legacy-return classification. Old full-record writers
remain compatible while disabled: they can erase `return_reason` or create
unknown returns. New workers settle those returns at their committed deadlines;
terminal unknowns need no repair. New scan admission rejects while disabled, so
mixed-version workers do not receive the new command vocabulary. Historical
receipt recovery runs before that admission gate.

## Activation and transient data blockers

Preview validates the proposal; it does not certify current fleet readiness or
approve a later snapshot. Serial apply checks complete active fleet membership
under its existing universe publication fence. Scoped apply checks before queuing
and independently rechecks at the ordered publication boundary after earlier
work has finished. Stale rule revisions reject normally.

An active returning Deploy without a proven cause rejects activation with an
operator message to keep workers running until it settles, then retry the usual
rules command. No charge, rules change, backfill or retiming occurs. If an earlier
input creates that blocker after a scoped proposal was queued, publication saves
a rejected outcome and retires that boundary without activating it. This lets
later return events settle normally; it does not strand gameplay behind a failed
activation. Retry normal rules apply/upgrade after settlement. Only confirmed
`Applied` or `AlreadyActive` completes activation; a `Pending` ID means keep
workers running and retry the same command as described in the rules runbook.

The pure readiness validator checks coverage and current return facts, not
process versions. There is no stored readiness bit. The read-only evidence
classifier remains available for a separately authorized repair, but the default
rollout uses natural settlement and needs no historical backfill.

## Schema preparation

Migration `0034_phalanx_endpoint_indexes` uses the ordinary transactional index
pattern. It adds candidate indexes for active ship origins/destinations and
in-flight missile destinations, without changing fleet JSON or adding a data
constraint. The removed causal migration 0033 remains absent.

The existing preparation bounds apply unchanged: 10 seconds overall, 5 seconds
per statement and a 1-second DDL lock timeout (migration coordination can wait
up to 5 seconds within the overall bound). There is no new manual index script,
required prebuilt-index check or timeout override. Normal `orbit db-init` may
prepare the schema before rollout under those same bounds. A timeout fails
preparation and grants no readiness; it is not a successful deployment.

Fixture tests cover populated-table migration and selective lookup, not production
build duration. Index construction scans the retained tables and takes normal
transactional index locks. Very large or busy deployments may exceed the existing
bounds; production volume and timings have not been measured. Such a failure
requires diagnosis through the existing schema/deployment process, not a phalanx
credential or history-repair workflow.

## Deactivation and rollback

Remove `world.phalanx` through normal rules export/diff/apply before a rollback to
incompatible writers. Confirm the actual applied revision. A prior admitted scan
can complete and charge before the boundary. Admission refuses new scans as soon
as deactivation is queued; its atomic active/pending-rules read closes the
publication race. Existing IDs retain their historical receipt recovery.

The normal [rollback boundaries](rules-updates.md#deployment-and-rollback-boundaries)
still apply: deactivation does not certify that an older binary understands every
retained rules/report format, and it does not authorize a runtime-mode downgrade.
Keep reports and receipts; deactivation never deletes or reinterprets history.

## Paid observation contract

Clients submit `WorldAction::ScanPlanet { source_moon, target_planet }` through the
protocol-4 foreground command pair, binding presence to the owned source moon.
Stable body IDs never rebind by coordinates. Navigation and report refresh do
not scan; no live scan query exists.

A committed receipt's sole `result_ids` entry is the recipient-only report ID.
Fetch it through the authenticated report-detail API. Uncertain delivery recovers
the original receipt by command ID. Reopening is free and historical; another
observation uses a new paid command ID. Existing pagination, retention and
read/hide/star actions apply. Scan sharing is unsupported. Observed owner names
remain historical snapshots.

Every scan independently rejects relevant unknown return facts before any debit
or report as generic `UnavailableContent`. It returns no partial rows or
fleet-dependent player diagnostic. Operator diagnostics remain private; do not
infer causes from timing or reports.

## Player flow

Open Sensor Phalanx in lunar Facilities for construction and range guidance.
Choose a planet in Galaxy with the source moon selected, then select **Scan planet**.
The confirmation shows the local fuel balance and exact 5,000 deuterium charge.
A scan uses the ordinary command ledger and recovery; **Check scan status** recovers
an uncertain command instead of purchasing a second observation. **Open saved scan**
uses the report ID in the committed receipt. Reports also remain accessible through
the normal inbox. Reopening or refreshing a report never scans. **Scan again** is
an explicit additional purchase.
