# Up-front inventory and audit

Audit date: 2026-11-10. Current source baseline:
`0c235fd6d27422374abf61ea44e39c015a9c1675` (merged PR #385).
Historical application baseline:
`a119915ffaeb881a7f54d65542478f4788bd4210`.

## What was audited

- Fresh native Playwright collection of the application, component, production
  homepage and six explicit browser selections. No browser was launched.
- Every current spec's test declarations, imports and direct-body source signals;
  targeted reading of the high-density mixed suites, production seams, fixture
  helpers, runner/configuration, Make targets and CI selection/diagnostics.
- All ten phase-one migration ledgers, the combined verification record and
  relevant repair ledger entries. Original 1,183-case collection was exported
  from the retained phase-one artifact before it could be lost with `/tmp`.
- Current source coverage entry points for client/controller and real
  engine/HTTP/PostgreSQL contracts; explicit acceptance responsibilities.
- Exact final PR CI phase metadata and observed merge-group/main outcomes.

This is a complete **inventory, ownership and migration-design audit**, not a
claim that unimplemented replacements are equivalent. Source patterns identify
where to inspect; they do not prove a defect. Existing server test files are
starting evidence, not a claim that every authorization/race schedule is already
covered. No production files, tests, runners or CI selection were changed by
this audit, and no acceptance suite was executed for it.

## Inventory reconciliation

There are 816 application cases in 73 files, 271 component cases in 27 files,
10 production-homepage cases in one file, and 22 explicit browser cases in 13
files: **1,119 current case identities in 114 distinct spec files**. No current
case has expected outcome `skipped` or `failed`; `expected_outcome=passed` in the
CSV is configured expectation, not an execution result. The application cohort
contains exactly 39 tagged journeys and 777 still-required feature cases.

The historical collection contains 1,183 application cases in 76 files. 968
historical leaf titles have at least one exact-name match somewhere in the
current browser inventory; 215 do not. **Neither number is a migrated/retired
coverage count**: wrappers, titles, layer changes, consolidation and added main
cases require the linked ledger. Leaf-title matches can be ambiguous. Full
ancestry/project and source history are authoritative. Every historical row is
assigned an owner and linked to its existing coverage ledger; its new owner
settles any remaining gap during that domain's implementation, not by rerunning
the original retired browser scenario.

The CSV `source_declaration_lines` resolves the current title template, including
possible candidates for dynamic names. `collector_line` is also retained but is
not a stable source anchor: observed collection locations can differ from raw
TypeScript locations through transformed source maps. Prefer full title paths
and the source hashes in `files.csv`. Do not key a migration on leaf title or line
number alone.

## Findings and concrete decisions

| Finding / evidence | Consequence and required work | Owner |
| --- | --- | --- |
| 108 application resource/quote/cancellation cases remain; autosave, inspection and cancellation models already exist | Move explicit schedules/arithmetic down; preserve real pending sliders, storage restoration, Retry and navigation until their replacement protects those behaviors | 01 |
| 82 cases remain in catalog-pages; 67 components already cover detail/progression | Audit duplicates across layers before adding more browser tests. Per-item rules/content belong in the existing catalog contract tests, distinct native controls/layout remain components | 02 |
| Existing detail/progression, Galaxy and tutorial scenes import createAppRouter; several also instantiate the real Coordinator | These are isolated from HTTP but not necessarily small dependency boundaries. Trim unnecessary provider/router graphs when extracting a real presentation seam; do not replace the actual production model with a fake just to reduce imports | 02/03/04; shared support 09 |
| 120 fleet/Galaxy application cases plus 99 components | Separate ordering/protection/reservation schedules from native input and command wiring. One family should not execute every mission × item × viewport combination unless a distinct contract requires it | 03 |
| Empire has 31 cases mixing value semantics and layout; lifecycle actions already have settings seams | Selectors/static render for facts; real confirmation/focus and representative command/route integration for lifecycle controls | 04 |
| shell.spec.ts has 59 cases embedding fleet, report and economy assertions | One physical file owner receives domain replacement evidence. Avoid simultaneous edits and preserve unique cross-surface wiring | 05, with 01/03/06/08 handoffs |
| HUD has 37 application cases despite deterministic notification-history, refresh and pagination controllers | Keep native observer/scroll/focus/loading integration; move captured observer batches, expiry, rejection and coalescing schedules into those controllers | 06 |
| Social/alliance phase-one review restored expired-cursor live status and mounted identity refresh | Static/controller coverage alone does not replace subscribed UI state, error live regions or focus. Preserve those observable contracts in future slices | 07 |
| 43 of 59 report application cases are deletion/cleanup | Separate rollback/uncertainty/order schedules from real selection, list/detail return and durable reload. Match hidden/redacted/unknown facts to model and actual server coverage | 08 |
| fixtures/game.ts ends unmatched API requests with a generic 404; the shared application fixture does not independently assert zero unexpected operations | An unanticipated request can be silently tolerated if UI assertions still pass. Add centralized diagnostics with explicit intentional-error contracts, then audit affected callers; do not replace negatives with blanket success | 09 |
| Component fixture rejects API requests and page errors, but base fixture wraps browser.newContext to provide announcements | Preserve all-context isolation and teardown semantics when modifying fixtures. The wrapper is an audit seam, not a demonstrated failure; do not change it speculatively | 09 |
| Both routine runners now precompile; earlier component failure had 701 dev-module requests inside an assertion window | Keep compilation separate from behavior execution. Do not restore Vite development compilation as test readiness or raise assertion timeouts | 09 |
| 39 journey tags include both strong route/entry contracts and potentially component-level loading/selection cases | Review each case against unique application wiring; tags are candidates, not a final gate definition | 10 |
| Phase-one ledgers retain historical “pending” prose followed by later integrated verification | Preserve chronology but use current source plus the combined verification and this frozen inventory for status. Do not redo completed migrations because an old paragraph says pending | Domain owners; final reconciliation 10 |
| CI builds fixture bundles on each application shard; journeys also validate production homepage assets; native checks build production frontend | Measure actual setup/artifact equivalence before reuse. Fixture development-mode bundles are not production artifacts. Do not remove independent release-asset validation | 09/10 |

## Retirement and coverage-gap register

This register highlights material known gaps and repair constraints; the linked
ledgers and historical CSVs contain the full scenario history. A new location,
name, owner or passing retry never resets a repair allowance. Fix an independently
established product defect; do not delete its protection to green CI.

| Scenario/family | Status and remaining protection | Gap / action | Owner / evidence |
| --- | --- | --- | --- |
| Fourteen-launch Galaxy toast tour | Retired; notification ordering/expiry and swipe controller tests, independent native mouse/keyboard/stack tests remain | Exact large setup + repeated native gesture tour is not retained; do not recreate it | 03/06; [HUD ledger](../test-migration-hud.md) |
| Native touch swipe then tap on promoted toast | Retired after its cleanup repair and CI recurrence in run 42838492232 | Missing native Chromium touch sequence is explicit; controller/mouse/keyboard checks do not prove it. No diagnosed product cause was established; do not add a renamed stabilization test | 06; [HUD recurrence](../test-migration-hud.md#pr-385-recurring-native-touch-scenario-retired) |
| Heavy Fighter selected-quantity submission | Retired; catalog/HUD model contracts and representative other ship form journey remain | Exact Heavy Fighter toast/green-orb browser wiring is lost; retain exact costs/outcome semantics at deterministic boundaries | 02; [catalog ledger](../test-migration-catalog-content.md) |
| Galaxy supporter expiry/tier tour | Retired; player-profile controller and isolated identity colors/semantics remain | Galaxy-specific badge/overflow wiring is not established by the shared profile component | 03/07; [profile ledger](../test-migration-shell-profiles.md) |
| Startup deployment reload / session rotation tours | Retired; reload/session/coordinator contracts and surviving recovery controls remain | Real multi-document route/live-region and full rotation-tour wiring are not claimed | 06; [profile ledger](../test-migration-shell-profiles.md) |
| Desktop quiet-session refusal | Main #384 retired unexplained startup failure; mobile and coordinator refusal tests remain | Do not restore desktop variant while integrating new main | 06; [repair ledger](../../runbooks/test-performance-audit.md) |
| Desktop vacation minimum/return | Main #384 retired exhausted variant; mobile journey and engine rules remain | Mobile is the current required journey; do not revive desktop to preserve an old count | 04; [settings ledger](../test-migration-tutorial-settings.md) |
| Alliance create/invite/join/requote/recall tour | Retired; engine/DB group semantics and independent controls remain | Chained command wiring/recall layout is not replaced; map real invariants, not a renamed tour | 03; [profile ledger](../test-migration-shell-profiles.md) |
| Three-report current identity tour | Main #382 retired recurrence; profiles/adapters/report facts remain | Three-report focus/Escape consumer wiring is not claimed | 07/08; [repair ledger](../../runbooks/test-performance-audit.md) |
| Normal-motion page-wide “no animation” | Main #384 retired exhausted assertions; intentional Briefing motion exists | Keep precise sidebar CSS and reduced-motion protection; do not reinstate obsolete blanket prohibition | 05; [repair ledger](../../runbooks/test-performance-audit.md) |
| Combined keyboard/touch tooltip replacement | Failed after its one repair; replacement removed and original independent touch case restored | Original required touch behavior still exists; migration remains incomplete rather than coverage silently lost | 01/05; [combined verification](../test-strategy-overhaul.md) |
| Native modifier/new-tab resource energy navigation | Retired after repair recurrence; other routing/keyboard/touch cases remain | Exact modifier/new-tab assertion is lost, not proven by route model tests | 01/05; [profile ledger](../test-migration-shell-profiles.md) |
| Historical report glance/range/bulk-read stalls | Already retired; engine/model and independent report interactions remain | Do not reproduce those exhausted multi-step journeys when migrating cleanup | 08; [report ledger](../test-migration-reports.md) |

Non-failing coverage intentionally restored during phase one must not be dropped:
four production autosave/restoration cases, live bot-to-human identity refresh,
HUD buffered-pagination loading state, expired noticeboard live status and
fleet disclosure expansion across changed membership. Their owner briefs point
to existing production boundaries; they require observable replacement evidence.

## Server-invariant obligations

| Contract | Existing evidence entry points | Migration obligation |
| --- | --- | --- |
| Quoted cost, paid order, optimistic reservations and cancellation | progression/options/manufacturing/production-autosave client tests; engine economy/progression_terms; PostgreSQL progression | Client examples must not substitute for real payment, authorization, idempotency or stored outcome assertions (01/02) |
| Fleet launch, group membership, recall and paid scans | Dispatch models/controllers; engine missions; PostgreSQL attack_groups, colonization, missile_warfare, phalanx | Cover stale quote, ownership, exactly-once mutation and persistence at actual server boundaries (03) |
| Vacation, deletion, abandonment and identity revisions | settings/arrival models; engine missions/vacation; PostgreSQL empire_deletion, empire_history, planet_names, identity | Keep destructive-action review separate from server rules; check ambiguous committed writes and stale revisions (04/07) |
| Auth/enrollment/recovery and replay | bootstrap/session/coordinator models; transport auth_worker_tests/bound_api; PostgreSQL oidc/signup/security/ordering/recovery | Preserve actual auth and reconnect acceptance; browser fixture success does not establish an authenticated server session (06/09) |
| Alliance/private social information and blocking | alliances/social/recruitment controllers; PostgreSQL alliances/social/alliance_identity | Confirm access removal and command authorization in real server tests, not only hidden UI (07) |
| Report ownership, redaction, sharing revocation and durable deletion | report-engine/state/sharing-state; application report_sharing; PostgreSQL report_pages/report_sharing | Keep hidden/unknown facts honest; prove actual authorization, idempotency and persistence independently of mocked receipts (08) |

The named files were checked for existence; this audit does not assert exhaustive
server scenario equivalence. Each domain's implementation must name exact test
cases for the specific invariant it changes. Do not rewrite unrelated server
suites merely to claim a comprehensive overhaul.

## Explicit acceptance and production artifacts

Owner 09 reconciles every row; owner 10 checks final execution policy. These
remain explicit-only except the production homepage check. Preparation and cleanup
use the disposable Compose project and existing Make/npm runners documented in
[ci-runners](../../runbooks/ci-runners.md). No custom scheduler or process registry.

| Boundary | Current entry | Collected browser cases | Required purpose / audit |
| --- | --- | ---: | --- |
| Core | `make test-explicit SUITE=core`; bootstrap, construction, login, reconnect, transport, zfoundation specs | 10 | Real session, command, view/stream and reconnect wiring |
| MVP | `make test-explicit SUITE=mvp` | 1 | Representative real initial gameplay; remove duplicate assertions only against named lower-layer coverage |
| Progression | `make test-explicit SUITE=progression`; progression/responsive/routing specs | 6 | Real progression and context wiring; isolate redundant responsive permutations |
| Missions | `make test-explicit SUITE=missions` | 2 | Actual mission lifecycle across server/DB/client |
| Raiding | `make test-explicit SUITE=raiding` | 2 | Real combat/raid lifecycle and retained outcomes |
| Signup | `make test-explicit SUITE=signup` | 1 | Real signup topology with production-mode binary; keep separate from mocked hosted-auth cases |
| Recovery | `make test-explicit SUITE=recovery`; scripts/recovery.mjs | Script | Worker/process interruption, stream replay, admission and committed-state recovery |
| Migrations | `make test-explicit SUITE=migrations`; scripts/migrations-e2e.mjs | Script | Real old/new binaries, preserved identity/data, CLI setup and safe upgrade failures |
| Production container | `make test-explicit SUITE=container` | Script + opt-in tooling | Image setup, readiness/restart, no accidental accounts, production migrations and scoped cleanup |
| Rolling rules update | `make test-explicit SUITE=rules-updates` with valid previous bridge ref | Script | Cross-version compatibility and revision-specific prerequisites |
| Speed updates | `make test-explicit SUITE=speed-updates` | Script | Runtime speed-change behavior; supported by Make but absent from manual workflow choices at this snapshot. Reconcile/document the intended entry, not silently add a scheduled job |
| Bot compatibility | `make test-bots` | Script | Real previous-binary bot contract; preserve separately from frontend component fixtures |
| Production homepage | `make test-homepage-built` | 10 | Built/prerendered production assets; required in journey CI job. Not interchangeable with fixture bundle |
| Other focused explicit probes | [Full Make target inventory](inventory/make-targets.csv), including persistence/rules/identity/location previews | Native/scripts | All target declarations/prerequisites/recipes are recorded; validate their unique contract before consolidating wrappers. No unreviewed orphan target removal |

The [Make inventory](inventory/make-targets.csv) captures all 87 relevant native/routine/explicit target declarations, prerequisites and recipes, including focused probes outside the manual-workflow choices. It is a static inventory, not an execution script.

Full `make test-explicit SUITE=all` prepares acceptance and container validation;
recovery/migrations are script assertions and therefore absent from the 22-case
browser count. Audit guards in scripts/test-budgets.json as generous runaway
protection. Preserve routine native no-execution-deadline settings and functional
network/timeout tests. Use affected suites during development, then record the
final explicit matrix and any concrete omitted validation before closing 09.

## Existing execution evidence and cost

No execution was repeated for this documentation audit. The exact pre-merge
head `f351b627204fd7a457d6674ad9f3aa169f2a18f0` passed
[PR CI run 42868846292](https://github.com/unbought-games/orbit-imperium/actions/runs/42868846292).
The subsequently observed
[merge-group run 42873860417](https://github.com/unbought-games/orbit-imperium/actions/runs/42873860417)
and [main run 42875639615](https://github.com/unbought-games/orbit-imperium/actions/runs/42875639615)
also succeeded. Main run is associated with `0c235fd6`; these successes do not
prove future replacements or a zero-flake rate.

| PR CI phase | Job elapsed | Main check step elapsed |
| --- | ---: | ---: |
| Native | 445 s | 355 s |
| PostgreSQL rules / world / rest | 513 / 375 / 773 s | 461 / 327 / 718 s |
| Journeys, including separate homepage preparation/check | 214 s | 77 s for selected journey boundary |
| Components | 291 s | 200 s |
| Six feature shards | 215–439 s | 147–332 s |
| Whole workflow, creation through completion | 798 s | Not a sum of parallel jobs |

Check steps include native runner preparation/compilation as applicable; they
are **not pure test execution time**. Runner allocation wait was not separately
measured in that saved evidence. PostgreSQL rest was the critical path; reducing
browser counts alone does not establish an equivalent merge-delay reduction.
Previous failures remain counted: run 42835800347 failed the cold component
module graph; run 42838492232 failed the already-repaired native touch scenario.
The [combined verification](../test-strategy-overhaul.md) retains their diagnoses,
artifact IDs, changes and lost coverage. Earlier phase-one local failures and
resource-contention evidence remain there as well.

09/10 must separate dependency/image setup, fixture build, runner execution,
allocation wait, queue residence and end-to-end merge delay in the final evidence.
Do not compare a contended local three-worker baseline directly with isolated CI
and call the difference a measured strategy speedup. Observe five naturally
occurring merged PR lifecycles after cutover; no repeated green runs or scheduled
validation is authorized by this plan.

## Reproduction and delta handling

Collection used installed pinned dependencies and these native entry points:

```sh
ORBIT_UI_E2E=1 node node_modules/@playwright/test/cli.js test --list --reporter=json
node node_modules/@playwright/test/cli.js test --config=playwright.components.config.ts --list --reporter=json
ORBIT_HOMEPAGE_E2E=1 node node_modules/@playwright/test/cli.js test --list --reporter=json
ORBIT_CORE_E2E=1 ORBIT_TEST_SUITE=core node node_modules/@playwright/test/cli.js test --list --reporter=json
```

The other explicit selections use the corresponding `ORBIT_MVP_E2E`,
`ORBIT_PROGRESSION_E2E`, `ORBIT_MISSIONS_E2E`, `ORBIT_RAIDING_E2E`, or
`ORBIT_SIGNUP_E2E` flag and matching suite name, with competing flags absent.
Collection returns configured expected outcomes without executing assertions.

For each spec, the file manifest stores its SHA-256 and import list. Current case
IDs hash boundary, full path, project and full suite/title ancestry. Historical
exact-name matching is only an index into coverage ledgers. The audit validation
checks all current files/cases are assigned once, each recorded hash matches the
snapshot, all 39 journey rows are included in application rows, and each linked
local resource resolves. Future sessions compare the selected owner's files and
record their delta in STATUS.md; no need to rerun this whole audit daily.

## Audit validation result

Passed: 1,119 unique current identities and 1,183 unique historical identities;
114/114 current spec files assigned exactly once; current boundary counts
reconcile to the manifest; all 39 journey IDs belong to the application set;
every spec SHA-256 matches the pinned merged tree; local Markdown targets and
named validation/server files exist; whitespace checks pass. The 87 native
Make target declarations are indexed separately. No production/test/config files
changed, and no browser/build/database/container validation was run for this
documentation-only audit.
