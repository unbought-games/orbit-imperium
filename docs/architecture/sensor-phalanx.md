# Sensor Phalanx backend contract

Part 1 supplies pure eligibility, observation rules and causal fleet return facts.
Part 2 adds the ordered paid command, endpoint loader, historical report storage
and API contracts. Live activation remains blocked on writer exclusion, and
standard rules, construction and player UI remain disabled. `sensor-phalanx-v1` fixes range to
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
The ordered loader supplies source/target lookup and collection coverage.

`project_phalanx_fleet` and `project_phalanx_missile` return an optional
`PhalanxObservationV1`. There is no observer permission parameter: the same
traffic is observed regardless of ownership, alliance or espionage research.
The loader iterates unique fleet/missile identities, collects only
`Some` rows and exposes public name snapshots only for visible participants.
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
The lineage audit rejects contradictory known causes while accepting omissions.
Routine deployment accepts unknown active returns too: the unpublished migration
0033 was removed. There is no startup journal traversal, backfill, fleet constraint
or history-dependent migration failure for this feature.

### Ordinary rolling deployment

Deploy this binary with scans disabled through the normal rolling process. No
fleet drain, writer quiescence or classification is required for this deployment.
New return transitions record causes. Legacy workers accept the extra field when
deserializing but do not retain it in their typed struct. Their persistence code
writes a changed fleet with `ON CONFLICT ... SET data=excluded.data`: the full JSON
replacement loses the cause. Unchanged fleets are skipped by the old equality
check, so simply reading a fleet does not erase it. In particular, old workers can
complete new returning fleets and write terminal records without the cause, and
can create unknown active returns themselves. Neither write is a schema error.
Do not treat an observed cause, a momentary lack of unknown fleets, or one new
process reporting healthy as proof that the rolling upgrade is complete.

### Explicit activation boundary for parts 2 and 3

The building and scan capability remain disabled. `validate_phalanx_scan_readiness`
is a pure validator, not an exclusion proof or a saved readiness flag. The
coordinator must satisfy the following contract before part 3 enables the
feature; the part 2 fail-closed implementation and remaining blocker are below:

1. Finish the ordinary rolling deployment. Establish that every writer that can
   commit to this universe understands return causes (workers, admission/API,
   editors, tools and rollback binaries). Drain/fence old claims and prevent old
   binaries from reacquiring work. This operational exclusion is an activation
   prerequisite; current rules revisions alone do not attest binary versions.
2. Extend the existing rules prepare/apply paths, including both serial
   `apply_rules` and `apply_scoped_rules`, to gate scan-capability activation.
   Prepare may report blockers, but the apply path must recheck under its universe
   barrier and commit fencing. Load complete active fleet membership with covered
   absence. Do not reuse a stale preparation snapshot, a count from an index, or
   the viewer's scoped fleet collection as readiness proof.
3. Call `validate_phalanx_scan_readiness` with derived writer-exclusion and coverage
   proofs and that complete collection. Unknown active returning Deploy blocks
   activation. Either let it reach its already committed terminal deadline through
   ordinary gameplay, or explicitly classify and repair it from authoritative
   evidence. Never guess from timing/reports, discard the fleet, retime it, assume
   recall, show it, or silently omit it. Terminal unknowns need no classification.
   Outbound legacy fleets acquire a cause at their next new-writer transition.
4. If classification is chosen, run an explicitly requested operational job with
   bounded batches outside ordinary schema preparation. A trusted loader must
   establish successful Applied journal provenance and complete candidate
   evidence. `classify_legacy_deployment_return` consumes that supplied evidence
   without querying or mutating anything. It requires an Outbound-to-Returning
   transition matching the retained fleet and checks the actual RecallMission or
   outbound FleetLegDue input. Known causes in newer journals must agree. Missing,
   stale, invalid or conflicting evidence returns typed fixed-message diagnostics;
   no raw SQL/driver error data is surfaced. The helper does not certify loader
   completeness or grant readiness. The operational loader/writer is not shipped
   in part 1; unresolved evidence is a real activation blocker until natural
   settlement or a reviewed repair.
5. Any future explicit backfill must compare-and-set the exact inspected fleet
   under the operational barrier, adding only the proven cause. Preserve terms,
   hashes, deadlines, revisions and historical journal bytes. Handle old-writer
   field loss and concurrent settlement by reloading, not overwriting newer facts.
   Recheck complete readiness in the activation transaction before publishing the
   versioned scan rules/capability through the existing rules-activation mechanism.
6. Every accepted scan must also check all relevant return facts on its complete
   ordered scan snapshot before charge/report storage. Unknown causes refuse the
   whole scan, including hidden-only candidate collections; do not publish partial
   rows. Keep detailed readiness/evidence diagnostics private to operators, using
   a generic unavailable capability response for players. If legacy writers are
   reintroduced, disable scans through the same coordinated activation boundary
   before admitting them. Rollback while scans are enabled is not supported merely
   because the JSON schema remains readable.

Part 1 supplied the deterministic readiness and classification checks. Part 2
adds the gate, loader and API handling described below, but cannot establish the
missing process-version exclusion proof and supplies no operational backfill. Production evidence and volume have not been
inspected. Their absence cannot block this disabled-feature deployment; proving
those activation prerequisites is required work for part 2.

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


## Part 2 implementation and part 3 handoff

`WorldAction::ScanPlanet { source_moon, target_planet }` uses the existing
protocol-4 foreground pair, actor/body binding, admission hash, command ID,
ordered transition, atomic persistence, and receipt recovery. The dedicated
resolver reuses the eligibility and observation functions above. It materializes
source-local economy, validates, projects once, debits exactly 5,000 deuterium,
and inserts one `MissionReport` with kind `Phalanx`, one recipient, and payload
`{ kind: "Phalanx", observation: PhalanxReport::V1(...) }`. Accepted empty scans
pay. Any rejection produces no debit or report. The committed receipt's
`result_ids` contains exactly that report ID, including on uncertain retry.

The dedicated PostgreSQL loader loads the actor's existing economy closure, the
bound target body/policy, all active ship records with that stable origin or
body destination across owners, and all in-flight missiles bound to that target.
Foreign origins load identity columns only. Active ACS groups are selected by
member IDs, including initiating fleets whose intent has no group ID. Holds use
committed fleet deadlines. Endpoint indexes select candidates; only pure
projection authorizes rows. The complete candidate collection and covered absence
are part of the claim snapshot and are reloaded for hash validation at commit.
No per-scan universe economy or universe fleet traversal is performed.

Scan scopes include actor, source location, target location, and current target
owner. Existing launch/recall/arrival/return, group, depot, missile, and lifecycle
scopes intersect these dependencies. Source ordering serializes competing fuel
spends; target location ordering closes addition/removal membership races. Normal
serial and scoped barriers protect rules changes. Only the scanner is added to
`affected_viewers`; dependencies and private fact hashes do not become viewer
revisions or report metadata. Presence follows the existing explicit actor gesture
contract and creates no target activity signal.

Report detail is recipient-authorized and immutable, with no live enrichment of
observed owner names. Preview contains only source, target, observation time, and
cost. Existing report pagination, retention and metadata actions apply. The
sharing allowlist rejects Phalanx. Generated client contracts include the paid
action, `ScanPlanet` capability for enabled custom rules, report envelope, and
single `{ kind, at }` deadline representation. No UI implementation is included.

The explicit activation boundary above remains binding. The current runtime has
**no enforceable proof excluding incompatible writers**. Prepare refuses that
proposal, serial/scoped apply independently refuses it, and scenario installation
cannot bypass it. Admission rejects new scan commands while disabled or while a
deactivation barrier is pending, after checking original receipt recovery. A
single active/queued-rules read prevents publication races from admitting new
command vocabulary to a rollback worker. Publication loads complete active membership but supplies no
invented exclusion proof to `validate_phalanx_scan_readiness`. Scoped preflight
avoids leaving a blocked barrier that would prevent natural legacy settlement.
This is an explicit blocker, not a claim that production activation is ready.
There is no startup history gate, data constraint, backfill, process registry, or
saved readiness bit. See the [operator guide](../operations/sensor-phalanx.md).

Before part 3 enables standard construction and scan rules, integration must
establish the missing writer-exclusion boundary and revalidate readiness under
apply. Part 3 then owns lunar catalog enablement, Facilities/Galaxy UI, immutable
report rendering, and desktop/mobile visual validation. Use the receipt's report
ID directly; do not race an inbox refresh or turn route loading into a command.
Keep retry on the original ID and make another observation an explicit new paid
action. Moon removal/fallback, jump gates, expeditions and sharing remain separate
work. No production acceptance or deployment claim is made by this increment.
