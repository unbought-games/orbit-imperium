# Sensor Phalanx foundations

This increment supplies pure eligibility and observation rules and causal fleet
return facts. It does not enable Sensor Phalanx, add a command or endpoint, spend
resources, store reports, or change player UI. `sensor-phalanx-v1` fixes range to
`level² - 1` and cost to 5,000,000,000 local deuterium micro-units.

## Integration contract

`validate_phalanx_scan` consumes current active source/target bodies, matching
owner policies and the universe topology. The caller proves body existence and
active membership; an absent body, empty position, debris or moon is not a valid
planet target. Completed source levels and materialized source-local resources
are authoritative. A parent's balance is never an input. Level one includes the
source system, using checked u128 arithmetic and the current linear topology.
Only the scanned target must be in range.

The source must be an owned moon with completed Sensor Phalanx level at least one.
Actor vacation, deletion draining/removal, own targets, target vacation/removal,
wrong body kinds, other galaxies, range failures and insufficient fuel reject.
Foreign allied, inactive and beginner-protected planets are allowed: scanning
has no hostile-launch score restriction. Validation never mutates either body.
Missing source/target lookup and collection coverage belong to the future loader.

`project_phalanx_fleet` and `project_phalanx_missile` return an optional
`PhalanxObservationV1`. There is no observer permission parameter: the same
traffic is observed regardless of ownership, alliance or espionage research.
The eventual loader should iterate unique fleet/missile identities, collect only
`Some` rows and supply public name snapshots only for visible participants.
Never include hidden membership counts, private revisions or raw fleets in the
receipt. With the same receipt metadata, empty and hidden-only collections must
serialize identically.

`PhalanxReport::V1(PhalanxReportV1)` is the versioned immutable report envelope.
It carries receipt ID, observation time, source/target public endpoints, billed
cost and rows. Fleet rows contain public owner identity, mission, phase, endpoint
coordinates/kinds/public body IDs, exact surviving ship types/counts, and exactly
one deadline. They omit internal fleet/group IDs, cargo, launch times, speeds,
fuel, research, terms, revisions, randomness and future results. Missile rows
have their own shape: public attacker, source coordinates, target planet, count
and impact deadline; no invented ship/return/cargo fields or interception data.

| Phase/mission | Origin planet scan | Destination planet scan |
| --- | --- | --- |
| Outbound Attack, Transport, Espionage, Hold | Expected return | Arrival |
| Outbound Deploy | Hidden | Arrival |
| Outbound Harvest, Colonize | Expected return | Hidden |
| Returning non-deploy | Committed return | Hidden |
| Voluntarily recalled Deploy | Hidden | Hidden |
| Invalid-target Deploy return | Committed return | Hidden |
| Active Hold | Expected return | Hold end |
| Terminal/stationed fleet | Hidden | Hidden |
| In-flight missile | Hidden | Impact |

Outbound ACS uses `effective_fleet_due`, including group delays, and each member's
own accepted travel duration for its return. Outbound Hold adds committed holding
duration; active Hold uses its actual `due_at` hold end, including Depot extensions,
plus that fleet's travel duration. Returning fleets use the committed `due_at`.
Where effective endpoints coincide, destination arrival/hold-end takes precedence
while outbound/holding; returning uses the return deadline once.

`PhalanxEndpoints` is ephemeral loader input, not stored visibility.
`phalanx_endpoints` resolves today's stable body bindings and preserves empty
colonization destinations even if a colony later occupies the coordinate. Moons
and debris never substitute their parents. Missing origin bindings fail explicitly.
Future moon destruction must supply authoritative original/effective endpoints
and fallback IDs to this interface. It must not change the return reason; a
voluntarily recalled deployment remains hidden after home fallback. This increment
does not implement destruction, abandonment redirects or any other lifecycle.

Before accepting a scan, part 2 must settle earlier ordered events, load complete
relevant fleet/group/hold/missile membership and absence under stable snapshot
coverage, validate eligibility, project once, and atomically debit the source and
store the immutable receipt. Accepted empty scans pay the same cost. Rejections
pay nothing. Deduplication, scope ordering, recovery, identity loading and API
contracts belong to that command increment; these pure functions provide no free
live scan route and must not be exposed as one.

## Causal returns and compatibility

`MissionFleet.return_reason` records `VoluntaryRecall`, `InvalidTarget` or
`MissionComplete` when the fleet enters its return leg, including immediate
terminal recalls. Causes survive completion and serialization; accepted
`FleetTerms`, authorization, deadlines and revision rules retain their meanings.
`MissionComplete` includes an outbound action that finishes without a missing
physical target, and natural hold expiry. A deleted host forces its foreign held
fleets home with `InvalidTarget`. Reports are not causal authority.

Historical omitted causes remain omitted on JSON round-trip and mean unknown.
They are never inferred from timing. Non-deploy observation does not require a
cause; terminal fleets are hidden. An active returning Deploy without a known
recall/invalid-target cause is an explicit invariant error at the scan boundary.
The lineage audit rejects contradictory known causes while accepting omissions
needed to interpret old journals. Live PostgreSQL constraints additionally reject
unclassified active returning deployments.

Migration 0033 classifies legacy active returning deployments only from an applied
journal transition whose prior fleet was Outbound and whose resulting fleet JSON
exactly matches the retained fleet. A matching RecallMission proves voluntary
recall; a matching outbound FleetLegDue proves invalid target, because a successful
deployment terminalizes as Deployed. This examines retained transition journals,
not expiring reports or elapsed-time heuristics. Conflicting, stale or missing
evidence aborts the migration transaction with a concrete diagnostic. Restore
conclusive historical evidence before retrying; do not assign a default cause.
No production database was inspected as part of this implementation.

The migration adds only the proven causal field. It preserves accepted terms and
hashes, deadlines, revisions, historical journal bytes and terminal fleets.
Quiesce old writers during this schema upgrade: binaries that cannot write causes
must not create new returning deployments after the constraint is installed.

For journals produced before causal returns, explicitly select
`replay_legacy_mission_transition` by producing release. It reproduces the old
outcome shape without rewriting the saved facts or outcome. The older debris
replay adapter also strips these newly recorded causes. Current journals replay
with ordinary `transition`. No-op/rejected outcomes must remain absent rather
than acquire synthetic world fields.

Scenario mission edits accept `return_reason` only with `returning: true`; omitted
causes on fabricated returning attack/spy/transport fixtures mean MissionComplete.
Exports preserve explicit causes. Existing export restrictions on active Deploy
and Hold remain in force.

One timing difference from older draft rules is deliberately preserved: the
current engine recalls outbound fleets using elapsed time since launch, including
ACS delay, and completes zero-elapsed recalls inline. It does not apply the older
proposed capped ACS recall formula. This change observes actual commitments and
does not retime existing or newly recalled fleets.
