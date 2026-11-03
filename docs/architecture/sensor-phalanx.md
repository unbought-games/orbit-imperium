# Sensor Phalanx backend contract

Part 1 supplies pure eligibility, observation rules and causal fleet return facts.
Part 2 adds the ordered paid command, endpoint loader, historical report storage
and API contracts. Activation follows normal rules prepare/apply after deployment
to all processes; standard rules, construction and player UI remain disabled
until part 3. `sensor-phalanx-v1` fixes range to `level² - 1` and cost to
5,000,000,000 local deuterium micro-units.

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
Deployment tooling/operator completes rollout to every API, worker and operator
process before invoking the same image's normal rules upgrade. This follows
[rules operations](../operations/rules-updates.md#official-production-rollout)
and [concurrent runtime operations](../operations/concurrent-runtime.md).
Orbit does not detect replica versions or attest database credential exclusion.

### Explicit activation boundary for parts 2 and 3

1. Complete binary rollout using the existing deployment process, then use normal
   rules prepare/apply. Standard upgrade will enable phalanx only when part 3 adds
   it to the standard content bundle; custom fixture rules can activate it now.
   No registry, checkbox, override flag or new orchestration service is required.
2. Preview is advisory. Both serial and scoped publication recheck complete current
   active fleet membership under their existing barriers and commit fences.
   `validate_phalanx_scan_readiness` validates coverage and return facts; it has no
   writer-version parameter and no saved readiness flag. An index count or a
   viewer-scoped collection is not complete membership.
   Scenario create/replace accepts enabled artifacts and checks the final active
   collection after all edits under the exclusive world-edit transaction. Existing
   scenario export limitations remain; rules need not be disabled to round-trip.
3. Unknown active returning Deploy blocks activation until its existing terminal
   deadline settles through ordinary gameplay. Keep workers running and retry the
   usual rules command. Terminal unknowns need no classification. Outbound legacy
   fleets acquire causes at their next new-writer transition. No startup history
   traversal, automatic backfill, retiming, guessed cause or silent omission occurs.
4. Scoped preflight rejects a current blocker without queuing a boundary. If earlier
   work creates a blocker after queuing, publication records the rejection and
   retires the boundary with active rules unchanged. Later fleet settlement can
   proceed, so retry after natural settlement can activate normally. Existing
   pending/stale/retry semantics remain; publication never trusts a saved preview.
5. Any separately authorized repair must use conclusive Applied journal evidence
   and compare-and-set the exact inspected fleet under the operational barrier.
   The read-only `classify_legacy_deployment_return` helper validates supplied
   Outbound-to-Returning evidence; it does not query, mutate or certify provenance.
   Preserve terms, hashes, deadlines, revisions and journal bytes. Missing/stale/
   conflicting evidence stays unknown. No repair service ships in this increment.
6. Every scan independently checks all relevant return facts on its complete ordered
   snapshot before debit/report creation. Unknowns refuse the whole observation,
   including hidden-only candidates, with generic `UnavailableContent` for players.
   Deactivate through the normal ordered rules boundary before incompatible-writer
   rollback. Existing deployment/rollback compatibility responsibilities remain;
   the game does not certify that an older binary understands retained history.

Production evidence and volume have not been inspected. The backend implements
this activation contract without requiring new operational infrastructure.

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

The activation boundary above uses the existing deploy-everywhere → normal rules
upgrade flow. Complete current return membership is revalidated at publication,
and unknown active deployment returns are transient data blockers. There is no
writer-attestation requirement, startup history gate, data constraint, backfill,
process registry or stored readiness bit. Admission refuses new scans while
disabled or while deactivation is pending, after original receipt recovery; active
and queued rules are read atomically. See the [operator guide](../operations/sensor-phalanx.md).

Part 3 owns standard lunar catalog/rules enablement, Facilities/Galaxy UI,
immutable report rendering and desktop/mobile visual validation. The backend
activation path is usable now through normal custom-rules apply. Use the
receipt's report ID directly; do not race an inbox refresh or turn route loading
into a command. Retry uncertain delivery on the original ID; another observation
is an explicit new paid action. Moon removal/fallback, jump gates, expeditions
and sharing remain separate work. No production acceptance/deployment claim is
made by this increment.
