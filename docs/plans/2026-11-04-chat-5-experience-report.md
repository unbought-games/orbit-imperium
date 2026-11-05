# Chat 5 player experience report

Status: **Chat 5 UI implementation complete, focused validation and final visual
inspection complete. Shared implementation/runtime ownership is released to root
for Chat 6 integrated acceptance.** All work remains uncommitted; no PR/deployment.
The preparation and repair ledger below is retained as historical evidence.

## Authority and inspected baseline

All work is confined to `/Users/ethan/.codex/worktrees/d2d8/orbit-imperium`.
HEAD verified as detached `a4b2dcab0847182244c0afae1f5783c6a9a27b33`, with
integrated uncommitted Chats 1–3 and 3x defaults preserved. Chat 4 currently owns
shared code/contracts and execution. Chat 5 has written only this report.
No branch switch, reset, stash, clean, commit, push, PR, deployment, new chat or
subagent. No Cargo/npm/build/test/dev-server process started.

Read AGENTS.md, `.agents/skills/ui-design/SKILL.md`, `apps/web/src/ui/README.md`,
the dated completion orchestration, implementation handoff, operations spec,
Chat 3 fleet report and foundation checkpoint. Read Chat 4's provisional report;
its `Tutorial` query, `SetTutorialPresentation` action and explicit ordered
guidance action are proposed seams, not frozen contracts. This report requests
capabilities; it does not assign new backend wire names or implement against them.

## Refreshed pre-transfer contract review

Root requested this read-only refresh while Chat 4 finishes backend validation.
Read current `crates/application/src/tutorial.rs`, generated TutorialView4 and
related schemas, ordered tutorial actions/lifecycle, report preview projection,
client schema validation and Chat 4's updated report. **The earlier requirements
table below is now historical: the implemented projection covers the needed UI
capabilities except for the two concrete contract defects identified here.** No
new backend API or broader capability is requested.

### Two concrete blockers for Chat 4 before handoff

1. **Tutorial response rejects its own recommended fighter.** OpenAPI
   `TutorialSite4.recommended_ships.items` and the Attack branch of
   `TutorialNextAction4.ships.items` each allow only `SmallCargo`. Generated types
   consequently read `"SmallCargo"[]`. `tutorial_view` returns LightFighter for
   incomplete attack objectives even before a site exists, and fighter plus
   SmallCargo for the second operation. `Coordinator.world` validates the complete
   BoundWorld4 through OpenAPI-backed AJV, so this causes a rejected Tutorial
   response, not merely a TypeScript limitation. Correct the authored schema to
   represent the actual supported ships (existing ShipId3 includes LightFighter),
   regenerate contracts and validate an actual enrolled Tutorial response with
   incomplete contact/loaded objectives. No loose client cast is proposed.
2. **Site encounter headers invalidate report inbox/detail responses.**
   `crates/application/src/report_preview.rs::report_preview` has no SiteEncounter
   branch, so it emits only `{ "kind": "SiteEncounter" }`.
   `crates/storage-postgres/src/world.rs` includes that preview in report headers,
   while OpenAPI/generated `ReportPreview4` has no SiteEncounter member. Both
   BoundReports4 and BoundReport4 include ReportHeader4; client AJV therefore
   rejects an inbox containing this report and its detail response, despite the
   otherwise implemented SiteEncounterPayload4. Add a compact, recipient-visible
   preview and matching schema/type using existing immutable payload facts:
   site identity/coordinates, outcome, loaded loot and actual debris/policy suffice
   for a useful list/HUD. Retain NPC semantics; do not coerce this into player-only
   Combat previews. Validate actual site report list/detail responses against
   client contracts. Returning report detail already carries destination selection
   and can use retained Tutorial site context; no new report-to-flight endpoint
   is requested.

Both findings are source-traced, not results of running tests during this
read-only phase. Chat 4 retains code/contracts/test ownership. Chat 5 changed only
this report and did not run build, test or server jobs.

### Requirements now satisfied / consumer mapping

- TutorialView4 supplies enrollment/program/version, chapters/objective completion,
  homeworld, effective beginner/completed. `human` derives from machine participation;
  only `preference.beginner` is persisted. No local human flag or duplicate progress
  authority is needed. Unenrolled means suppress beginner controls; a separate
  enabled flag is unnecessary for this UI.
- `recommended_objectives` provides authored priority across queues. Incomplete
  objectives have typed Progression, Attack or AwaitReturn actions and minimum-level
  / after-objective constraints. Inspection includes the real request, cost/material,
  blockers and queue estimates. Select ready work using these and ordinary game
  resource/queue facts, retaining priority without counting pending work as earned.
- `Tutorial.sites` includes retired disclosed entries for fleet/report labels,
  title/briefing, ID/revision/anchor/stock, remaining forces, busy state, Attack and
  recommended ships. Retired entries are historical context; resolve/quote rejects
  new launches. Present the briefing's initial one-satellite description alongside
  actual remaining forces; do not imply replenishment after partial/failed sorties.
- `SetTutorialPresentation { beginner }` changes preference only. `OpenTutorial`
  is the explicit ordered/idempotent preparation action using normal paired
  foreground V4 handling with presence body null. A user action to enter/reopen
  guidance can prepare the lesson; query/render refresh must not issue it repeatedly.
  No new preparation or claim endpoint is needed.
- Receipts include stable IDs, objective/explanation, exact resources, destination
  and `granted_at.at_ms` with phase/ordinal, including zero-resource completions.
  History can display automatic payment and offline catch-up. Zero resources
  acknowledge accomplishment, not a fabricated resource award.
- The BoundWorld envelope supplies binding/request/revision and sample times;
  presentation/site/reward writes use ordinary affected-viewer invalidation.
  Chat 5 will refresh its single Zustand tutorial source on confirmed revisions,
  foreground and reconnect, rejecting obsolete response contexts. No new polling
  or event endpoint is needed. Completion derives full disclosure.
- Attack with null site supports independent play without automatic site creation.
  OpenTutorial prepares an eligible guided opportunity. Real dispatch uses
  ResolveMissionSite and FleetEstimate/FleetQuote/LaunchFleet. AwaitReturn fleet IDs,
  own missions, retained sites and report payloads support navigation without
  guessing causal links from timestamps.

Final measured 2x/3x artifacts and validation remain Chat 4's pending handoff,
not additional UI contract requirements. No implementation ownership transferred.
The first attempt to insert this report section failed because its context omitted
the start of a wrapped line; no file changed on that attempt. Corrected the insertion
anchor. This was a document-edit error, not a test failure.

## Existing architecture and concrete gaps (initial preparation)

| Area | Existing owner / reuse | Required integration |
| --- | --- | --- |
| Shell and navigation | `shell/game-shell.tsx`, `navigation.tsx`, `navigation-model.ts`, `routes.ts`, `route-target.ts` | Derive beginner disclosure from authoritative tutorial facts and preference; preserve threats, fleets, reports, account/settings and an always-visible full-interface escape. Existing destination availability is gameplay availability, not a tutorial lock. |
| Overview and chapter entry | Existing overview route and shell `ScreenContext` | Put the opening's chapter/next-action view in the familiar Empire context, with a compact return-to-guidance link while doing normal work. Avoid a duplicate game shell. Full players retain normal overview with optional compact guidance/history access. |
| Construction/research/manufacture | `features/progression.tsx`, `progression/resources-page.tsx`, `technology-page.tsx`, `use-progression-options.ts`, `shell/catalog-routes.ts` | Deep-link to real catalog detail by catalog key, body and slug. Existing quote/options, affordability, work summaries and command flow remain authoritative. Do not implement tutorial-only build buttons with separate rules. |
| Client authority | `client-model/game-store.ts`, `coordinator.ts`, `game-projection.ts` | Add one session-bound Zustand source for tutorial/site query results and load state as needed. Derive chapter counts, active chapter, navigation and recommendations in selectors/hooks. Existing `Coordinator.world` validates binding/request context; integrate with revision/reconnect refresh instead of uncoordinated component polling. |
| Site dispatch | `features/missions.tsx`, `use-dispatch.ts`, `use-dispatch-timing.ts`, `dispatch-review-model.ts`, `dispatch-review.tsx`, `shell/dispatch-location.ts` | Draft already permits a MissionDestination but search serialization reconstructs coordinate-based destinations. ResolveDestination and timing currently use planet/moon/debris selection. Add stable Site ID/revision selection and authorized resolution; carry through reload/back and FleetEstimate/FleetQuote/LaunchFleet. Remove `requireStandardDestination` rejection only with working Site presentation. |
| Fleet status | `features/command-hud/fleet-summary.ts`, `mission-fleets`, `fleet-flight-route` | Replace Site→Unknown→Unavailable fallback with explicit personal-site identity, shared by active cards and HUD. Retired site flights remain readable and recallable according to existing rules. Never interpret the anchor as a public planet or debris field. |
| Reports | `features/reports.tsx`, `report-observation.tsx`, `report-preview.ts`, `report-list-row.tsx`, `combat-report-model.ts`, `client-model/report-engine.ts` | SiteEncounter has a payload contract but no renderer: it falls through to unavailable-version text. Add explicit NPC participants/outcomes, stockpile loot, carried cargo and actual site-local non-collectible debris. Audit previews, HUD reports, filters/sorts and return-route links, not only detail rendering. |
| Resources | `ui/resource-mark.tsx`, `number-value.tsx`, existing report resource summaries | ResourceMark already enforces canonical colors after caller styles. Reuse it, preserve exact spending amounts and full accessible names/tooltips; never M/C/D. |

Current `MissionSiteView4` provides destination selection/coordinates, definition
identity/version, remaining stock and retired. It lacks display identity, briefing,
remaining forces and operation eligibility. The actionable list excludes retired
sites. `SiteEncounterPayload4` carries site ID, coordinates, explicit Player/Npc
identities, battle participants/rounds/losses/survivors, loot, cargo, debris policy,
actual debris and time. The existing receipt service projects stable receipt ID,
program/version/objective/explanation, beneficiary/homeworld, decimal resources,
grant input and grant order; it needs exposure through Chat 4's authorized client
projection. No client grant endpoint is needed.

## Experience plan

1. **Opening / chapter overview.** Use the current navy/champagne/editorial
   language: chapter eyebrow, serif task heading, one brief reason and one primary
   next action. A compact earned-progress line and expandable chapter checklist
   explain what is complete. Pending work is clearly different from earned work.
   Keep Show full interface visible outside disclosures on desktop and mobile.
   No modal tour, fake progress timer, claim control or skip payout.
2. **Economy and fleet preparation.** Next action opens the existing resource,
   facility, research or ship detail with the intended body and catalog item.
   Small contextual guidance explains why this prerequisite matters and links back
   to the chapter. Preserve actual quotes, exact costs, queues and normal pending
   submission feedback. When one queue runs, show the useful next parallel action;
   when no action is ready, name the real blocker/wait and retain access to queues.
   Do not require reading or following the guide to earn an accomplishment.
3. **Site briefing.** From the relevant lesson, show a personal introductory
   opportunity with its name, anchor, remaining forces/stock, recommended real
   owned fleet and concise reason to bring it. Explain finite opportunity, ordinary
   fuel/combat/cargo, and stockpile loot versus unavailable site debris. The single
   primary action prepares real dispatch; it does not launch. Missing required
   ships links to the relevant manufacture/prerequisite. A pending lesson/site
   preparation action has truthful loading/error state; GET does not create it.
4. **Dispatch and review.** Reuse the real ship/speed/quote/review flow. Personal
   site identity stays explicit; no misleading planet owner or public target
   action menu at its anchor. Show exact fuel, fleet, capacity, travel/return and
   current quote errors. Use server eligibility for retired, busy or stale targets;
   refresh the briefing on revision conflict and require review again. Preserve
   user ship/speed edits across advisory refreshes. Mode changes cannot cancel or
   relaunch a submitted fleet.
5. **Contact and return.** A site report states the actual outcome and NPC force,
   losses and survivors. Lead with the result; disclose rounds/technical detail.
   Label stockpile loot loaded aboard separately from total cargo and automatic
   homeworld milestone payment. Show actual debris including zero honestly:
   site-local, unavailable for collection, historical after retirement. Never add
   a Harvest action. Fleet status shows the real return destination and surviving
   cargo; encounter success does not masquerade as delivery.
6. **Receipts / offline catch-up.** Keep a durable reward history within guidance,
   accessible in full presentation. Each receipt says earned objective, exact
   resources, granted time and homeworld destination. Explain that payment already
   happened automatically, including while offline. Use the same receipt IDs after
   reconnect; never infer new payment from login or a toast. Prefer a concise recent
   activity/history section over introducing a persisted unread ledger merely to
   claim which grants occurred while this browser was absent.
7. **Reinvestment / completion.** After confirmed delivery, recommend the real
   productive upgrade. Mark completion only from authoritative earned evidence.
   Open the full interface at completion with optional lighter guidance and receipt
   access. Keep existing/independent players in full presentation; generic ordinary
   accomplishments still appear. Browsing a hidden area offers Show full interface
   and entry, rather than a false gameplay prohibition or forced redirect loop.

Beginner navigation should expose economy/facilities first, then research/shipyard
as relevant, and operation destinations when needed. Fleets/status, incoming
threats, reports, settings/accessibility/account and the escape remain reachable
throughout, including unexpected incoming attacks. The exact chapter visibility
mapping waits for the authored Chat 4 objectives; use pure selectors, not stored
unlocked-tab booleans. Local state holds user edits/selected IDs/disclosure only.

## Backend handoff requirements for root / Chat 4

These are consumer requirements, not a proposed replacement API. Existing contracts
can satisfy them directly; document the mapping and refresh/error semantics.

| Priority | Required facts/action semantics | Why the client needs it |
| --- | --- | --- |
| Required | Authorized enabled/enrolled/unavailable state; pinned program ID/version; explicit presentation preference; chapter/objective stable IDs, order, text, thresholds/rewards and authoritative causal completion/receipts | Distinguish dormant feature, empty progress, loading and failure; derive earned progress without inventory/history inference or new client objective evaluator. |
| Required | Typed current recommendation with intended owned body and catalog key or operation/site/report/fleet identity; reason/blockers; prerequisite/queue context sufficient to choose parallel work | Route to an executable next action without parsing prose or duplicating authored content/rules. Existing progression options remain final construction/research eligibility. |
| Required | Final presentation action values, ordered acknowledgement and completion behavior; clarify whether lighter guidance is an existing preference or local disclosure | Show full interface changes presentation only; completed opening derives full disclosure. Bots/existing players stay full. No issuance, reward or retirement from the mode toggle. |
| Required | Exact explicit ordered guidance/lesson action and its prerequisites/result; retry/idempotency semantics; whether entering beginner guidance requires this action before Site list refresh | Lazy issuance must work for an idle eligible human and after re-entering guidance without GET mutation or repeated automatic commands on every render. |
| Required | Authorized current site briefing: stable ID/revision, definition/name, anchor, remaining force and stock facts, allowed mission/admission/busy/retired state or concrete typed rejection; recommended fleet from measured content | Useful briefing and attack preparation cannot be built from coordinates or definition IDs alone. Do not imply pristine forces after a previous failed/partial raid. |
| Required | Retained site identity/name/anchor for accepted flights and historical reports after removal from actionable lists, via existing view/report enrichment or authorized retained references | The active list intentionally excludes retired sites, so it cannot be the only label lookup. Avoid refetching an inaccessible target or calling it a public planet. A generic explicit personal-site label is safe fallback but not the preferred authored identity. |
| Required | Receipts accessible through the final Tutorial/read API with stable IDs, explanations, resource units, logical grant time and homeworld ID; clarify zero-reward completion representation | Accurate automatic-payment history and completion including offline/out-of-order events; no need for any claim/award endpoint. Homeworld can be resolved from owned bodies. |
| Required | Projection consistency: binding/epoch/viewer revision, request freshness, event invalidation on receipts/presentation/site lifecycle, and foreground/reconnect behavior | Keep one authoritative Zustand source, reject cross-session/stale responses, and refresh without timers establishing progress or permanently stale beginner navigation. |
| Required | Site report header/preview fields available to report inbox/HUD, and supported immutable report→site/operation/return references (if present) | Avoid detail-only support and misleading public-coordinate actions. Client must not manufacture a causal report/fleet link from timestamps. |
| Required | Final actual resource encoding and exact content/stock/reward values; measured intended fleets/2x/3x assumptions and retirement rules | Resource DTO values are fixed-point decimal strings, not arbitrary displayed integers. UI must not turn estimates into guarantees or invent different retirement/reward conditions. |

Current transport contract already accepts `MissionSites`, `ResolveMissionSite`
and Site selection for ordinary FleetQuote/FleetEstimate/LaunchFleet. No alternate
movement endpoint is requested. Confirm the final transport result shape: the
GameService helper resolves a site view, while Chat 3's world transport returns a
MissionDestination for dispatch. Consume the generated transport type, not the
internal helper return type. Backend errors should remain authoritative; useful
client recovery copy must not loosen authorization or hide real losses.

## Historical visual inspection and focused HUD correction

Inspected all six existing PNGs in `test-results/chat-3/`: standard dispatch review,
fleet compatibility and standard Galaxy, at desktop 1440x900 and mobile 390x900
viewports. Some are full-page images taller than the viewport. These are historical
baseline evidence only; no running interaction was exercised during preparation.

The mobile dispatch capture visibly places the orb over the right side of the
primary dispatch button. The mobile fleets capture covers explanatory text and
the Galaxy capture covers resource rows. Desktop shows the intended visual
language clearly. CSS confirms the mobile HUD is fixed above bottom navigation;
shell trailing padding/scroll margins make final controls scrollable but do not
stop the floating orb covering content at intermediate scroll positions.

Plan a narrow shell/HUD-owned responsive correction: give the mobile command
control a reserved chrome area outside the main scrolling content (reuse a compact
control/panel entry while preserving fleet/threat state), rather than patching each
page or just increasing trailing padding. Determine the smallest viable layout by
inspecting the running shell after ownership transfer. Preserve the desktop orb
and existing HUD panel behavior. Verify no occlusion at initial review, mid-scroll,
bottom, focus and panel-open states; do not hide essential alerts to solve overlap.

## Implementation and validation sequence after authorization

1. Re-read current Chat 4 report/contracts and Git state; obtain root's explicit
   ownership transfer. Inspect running Empire/progression/dispatch/reports/HUD
   nearest patterns before editing, on desktop and mobile. Historical PNGs do not
   satisfy this requirement.
2. Integrate query/action handling and Zustand source/invalidation, pure progression
   and navigation selectors, then chapter/history shell composition. Reuse existing
   routes/quotes; keep React and API handlers light.
3. Implement site briefing, stable destination serialization/resolution, actual
   estimate/quote/launch and retained fleet display. Add NPC report/preview/return
   presentation. Complete reinvestment/full-interface transition and HUD correction.
4. Add focused unit coverage for selectors, out-of-order/zero-reward completion,
   disclosure/escape, site route identity (including same-coordinate distinct sites),
   stale response/revision handling, resource distinctions and explicit NPC reports.
   Use coordinator tests for binding/reconnect/invalidation. Backend arithmetic,
   authorization, economy, replay and races remain in existing cheap backend layers.
5. Use fixture browser coverage for regressions that require browser wiring:
   recommendation→real detail/quote navigation; escape and keyboard focus; site
   briefing→dispatch→review→submitted status; report and return navigation; reload
   restoring selection/guidance/history; mobile HUD hit-target visibility. Exercise
   loading, error, retired/stale selection, unfavorable outcome and pending mode
   change without arbitrary sleeps or clock-based network assumptions.
6. Reuse `apps/web/tests/fixtures/responses.ts` (`withFixtureResponse` and
   `withProgressionResponse`): listener registered before navigation, successful
   complete response, then observable state. Gate intentionally held/error responses
   explicitly. Capture preparation is inactive when capture is disabled; behavior,
   layout and focus assertions remain active. Use repository `npm test -- ...` and
   `npm run test:ui -- ...`, applicable lint/format/contracts/boundaries/build checks
   once Chat 5 owns execution; coordinate broad validation with root/Chat 6.
7. Capture and inspect final running screenshots after final edits for opening,
   working/blocked guidance, building/research/manufacture contextual states, full
   escape/deep-link entry, site briefing, dispatch selection/review/pending/error,
   NPC report/preview, returning/returned fleet, receipts/offline catch-up,
   reinvestment/completion and relevant HUD/menu states. Desktop 1440x900 and mobile
   390x900, with screen/state/dimensions in filenames under `test-results/chat-5/`.
   Refresh affected captures after fixes. Root receives exact absolute paths and
   state/dimension inventory for inline inspection and final delivery.

Every expensive check will state its regression purpose. On failure, inspect
history and available repair records before the one permitted repair; record
failure evidence, repair/removal and retained cheaper protection. No retries for
luck, timeout inflation or fake-clock races. Record exact tested revision/source
fingerprint and preparation/build/execution/runner-wait timings separately. Root
owns final integrated validation; do not duplicate successful broad runs without
new changes or unresolved evidence.

## Preparation execution / cleanup

Only file/source/Git reads and local image viewing were performed before writing
this report. Source-discovery commands encountered missing guessed paths
`client-model/game-model.ts` and `apps/web/package.json`; located the actual
`coordinator.ts` and repository-root package file. A zsh unmatched reports glob
also stopped one search. These were read-only discovery errors, not failed tests,
and caused no file mutations. No test repair, test deletion or passing validation
is claimed. No setup/build/execution/runner/CI/queue timings apply because those
jobs were prohibited and not started; preparation elapsed time was not measured.
No database, browser, server, port lease, container or temporary artifact was
created, so no process/service cleanup was required. Existing caches/screenshots
and all other owners' files remain untouched.

## Implementation in progress (ownership transferred)

Root explicitly transferred implementation/runtime ownership after Chat 4's final
handoff. Both earlier contract blockers are fixed and verified in that handoff.
Chat 6 may edit only its two assigned PostgreSQL test files; Chat 5 does not touch
those files or run workspace Rust formatting. No new backend API is needed.

Read the final handoff/contracts. Captured and inspected current running overview,
resource/research/shipyard patterns, reports and ordinary dispatch review at desktop
and mobile before their UI edits. Baseline capture initially used an invalid overview
URL; corrected it. A manual capture then waited on decoding offscreen lazy images;
stopped that capture process and limited decode preparation to visible images.
These were manual capture diagnostics, not passing browser tests. Before images
remain under test-results/chat-5; they are not final feature validation.

Implemented initial client/UI integration: shared session-bound TutorialEngine in
Zustand, shell synchronization and mode controls, chapter overview and receipt
history, authored cross-queue recommendation selectors, progressive navigation,
private stable-ID dispatch selection/resolution/review, retained site fleet names,
explicit NPC report and preview content, and mobile HUD in normal document flow.
Implementation/visual refinement and complete browser coverage remain ongoing.

First focused unit run: **43 passed in 5 files**, Vitest **535ms** total. Covers
request deduplication, superseded revision/account response isolation, foreground
refresh, late-chapter research priority, reinvestment dependency, essential escape
navigation, same-anchor site URL restoration, explicit site review/fleet identities
and actual NPC loss/loot/debris facts. Updated the obsolete Chat 3 tests asserting
Site rejection/Unavailable labels to assert the new authorized identity; neither
protection was silently removed. Initial TypeScript preparation caught a typed
requirement field mismatch, missing fallback body kind and optional preview fields;
fixed before browser execution. Latest TypeScript check passed.

First browser attempt failed during module loading, before tests ran: Node ESM
could not resolve the extensionless AJV import pulled in through a test helper.
Separated the test fixture validator with explicit AJV .js import; no production
contract validation loosened. Browser module preparation was 1954ms. The next
focused browser attempt is running; results and any one-repair ledger follow.

### Provisional pixels for root (not final captures)

Inspected these early rendered captures; final refresh follows remaining fixes.
All paths have prefix `/Users/ethan/.codex/worktrees/d2d8/orbit-imperium/test-results/chat-5/`:

- `opening-1440x900.png`, `opening-390x900.png`: guided opening; mobile HUD now has its own layout row.
- `site-briefing-1440x900.png`: real personal target preparation and finite stock/forces.
- `site-review-1440x900.png`, `site-review-390x900.png`: actual fleet review with explicit NPC site identity, ordinary fuel/timing and launch control.

Viewport dimensions are in the filenames; full-page images may be taller. The
mobile review was captured after focus scrolled to the quote, so its full-page
capture includes the pinned resource header at that scroll position. Final capture
will normalize scroll for the full-page artifact and separately assert active
controls are unobscured. These are provisional evidence, not a completion claim.

First executable browser run: four navigation/cross-queue/history tests passed;
the same dispatch/report scenario failed at both widths solely because its
assertion expected a nonexistent `Departure order accepted` string. The command
was committed, and the failure DOM showed `Fleet dispatch result` with `Fleet sent.
You can prepare another fleet.` Inspected dispatch-feedback source/history
(ff3673a/0219d61/cb38228) and repository repair references; new test has no earlier
history. One repair checks that real committed result after a pre-registered
command response listener. No timeout/behavior assertion weakened. The failure
DOM also exposed a real Site feedback defect: it still linked the anchor to a
public planet. Fixed that presentation to use retained private site identity.
The browser preparation immediately before execution was 1877ms; suite 32.7s.
Another preceding module-preparation-only attempt (1863ms) needed JSON import
attributes in the shared test helper under Node ESM; corrected those imports.

The repaired broad dispatch→return→report browser scenario failed again at both
widths after successful launch and retained fleet rendering. Its new report HTTP
fixture pattern `**/reports` also intercepted the HTML `/reports` document GET,
then dereferenced null POST data and aborted navigation. Per AGENTS, **deleted the
scenario outright**; it is not renamed or rerun. Audited both newly added report
handlers and narrowed them to `/api/v4/` paths. The shared game's existing fixture
routes already distinguish API requests. Deterministic route/quote/fleet/report
model protection remains, as do existing ordinary dispatch browser tests. The
removed scenario's successful early assertions are historical evidence only.
Manual final screen inspection still must exercise actual dispatch/report states;
it is not represented as a replacement passing regression suite. Second suite:
2040ms module preparation, 45.0s runner; four other tests passed. No timeout changes.

Added required shared earned-receipt acknowledgment for progression/full-interface
screens. It derives the latest authoritative receipt; local dismissal stores only
its ID. Initial/reconnected display says Latest recorded accomplishment / Already
paid, not a new login payment. Zero-resource receipts say accomplishment only.
A focused build→completion-on-detail→dismiss/full-mode-reload test was initially
interrupted after identifying an incorrect accessible selector: the real building
button is named Confirm upgrade, not its visible Build Metal Mine text. No request
was sent. Inspected building-details/ActiveWorkDetails and history; corrected that
selector and active-work region assertion as the scenario's one repair. The other
four browser tests passed; one viewport was interrupted and the other not run.
No timeout was introduced. Manual report capture separately corrected the detail
API's direct QueryContext shape and the existing command-orb/Close command HUD
selectors; those manual failures are not passing browser-test evidence.

Focused existing-browser regression (5 scenarios) passed live mobile HUD and
desktop unread/recovery; failed two normal dispatch scenarios because their broad
world fixture treated Tutorial as a fleet request and dereferenced absent intent.
Audited all fixture-only `**/world` registrations and introduced `routeWorld` in
fixtures/game.ts, which answers the unrelated inactive Tutorial query with the
fixture's current viewer revision before delegating specific world requests.
Updated 25 fixture-only callers (exact list in Git diff); actual full-system
mission/raiding network intercepts and the new tutorial fixture remain independent.
This is the shared fixture repair for both failed dispatch tests, not a production
API workaround. Inspected their history (34c36a1/dc6cd74/cf8bec4) and repair notes.

The same run's HUD dismissal test expected scrollY=150 after closing, but clicking
the now-inline mobile control first scrolls it into view at 0. Updated its opening
position setup to bring the actual control into view before recording originalY;
retained modal/inert/animation/focus/body-unlock and exact scroll restoration
assertions. This is its one repair for the deliberate layout change. Initial
regression: 1905ms module preparation, 14.3s runner, 17.08s wall. No timeout changes.

Current focused validation: **222 unit tests passed** across 9 files in 981ms
Vitest / 1.73s wall; production build passed in 12.83s wall (Vite client 3.80s,
SSR 372ms); ESLint passed in 3.64s wall. Subsequent small presentation/link/stale-site
changes receive the final affected checks below. The existing five browser
regressions now all pass after their documented single repairs: 18.6s runner,
21.19s wall, including modal exit/inert/focus/scroll and normal dispatch review/reset.

Root's refinements are implemented: later stages use a compact chapter heading;
briefings lead with purpose, actual remaining force/stock, fleet and action, with
rules disclosed on demand. Visual fixtures now derive chapter completion flags,
start with zero energy at zero levels, and explicitly supply a 3x economy snapshot.
Receipt notices/history use concise accomplishment labels; minimum-level labels
say at least level N rather than pretending an advanced player just built level N.
Report fixture site/fleet context is aligned and single-round text is singular.

Guidance/history links now use URL hashes to reveal the requested section, open
native history disclosure and move focus, including repeated use on an already-open
full-interface overview. No preference/grant action is sent. The focused receipt
interaction covers progression→history and same-overview reopening with unchanged
command count/payment count. Malformed Site links fail explicitly rather than
silently falling back to a planet destination. A changed/retired/busy Site invalidates
an open quote while retaining edits; ordinary re-review remains required.

The expanded receipt/history browser scenario later exposed a real focus conflict:
its history disclosure opened correctly, but GameShell's general route-heading
layout effect stole focus from the requested summary on progression→overview.
This scenario had already received its one repair, so it is **deleted outright**
for both widths, not renamed. Fixed the production focus owner: explicit opening
hashes delegate focus to the opening disclosure instead of the general heading.
The failed run completed the earlier build/receipt/reload assertions before the
new link-focus check; that is historical evidence only. Final manual interaction
inspection will verify both navigation cases. Retained cheap unit coverage checks
authoritative receipt IDs, dismissal, independent progress, zero-resource receipts,
threshold wording and no mutated payment ledger. Six other browser tests passed
(1920ms setup, 38.0s runner / 40.68s wall for that run). No delay/retry workaround.


## Final UI handoff and ownership release

The usable interface now consumes the live authorized Tutorial and ordinary game
APIs: three chapters and authored cross-queue next actions, real progression detail
navigation, beginner disclosure and full-interface escape, explicit idle preparation,
stable private-site dispatch/estimate/quote/launch, retained site fleet identities,
NPC inbox/detail/HUD report rendering, actual reported debris without harvesting,
physical cargo return, reinvestment, automatic homeworld receipt acknowledgment and
history, and completion into the full interface. No collect/skip payout or local
completion timer exists. Shared game projections live once in Zustand; preferences
and native disclosure/hash/dismissed receipt IDs are presentation only.

Both root history-link cases were manually exercised after the focus fix: from
progression and repeated on an already-open full overview. The summary is focused,
in the viewport, and passes center-point hit testing below the pinned resource bar.
The final fix applies scroll margin to both the router's details hash target and
its summary; no arbitrary delay hides the issue. Optional guidance opening also
uses the same focus-owning anchor. Primary upgrade, escape and launch controls were
exercised/hit-tested; mobile HUD no longer floats over page actions. Missing ships,
fuel shortage, retired targets and a quote invalidated by retirement have useful
ordinary recovery navigation. Final screen captures use actual running React/Vite
with response-gated, controlled HTTP fixtures; they are not production server
screenshots or claims of a browser-driven full-system economic playthrough.

The UI fixture battle comes from the authenticated backend contract specimen;
private identities are mapped to retained tutorial context. Fleet quotes/returns
use the measured 3x capacity/duration/loot values for the depicted sortie, rather
than the earlier generic rich-fixture values. These visual fixtures establish
presentation and wiring; Chat 4's real PostgreSQL journeys remain the balance and
physical-economy evidence. The real program remains disabled until supported
operator activation. No production activation, dependency installation, database,
Docker container or full-system/recovery/rolling-deployment suite ran in Chat 5.

### Final checks and concrete limits

| Check | Final result | Measured phases |
| --- | --- | --- |
| Focused client/model tests (9 files) | 224 passed | Vitest 674ms total; 1.35s command wall |
| Retained onboarding browser tests | 6 passed | 20.8s runner; 23.35s command wall; module preparation in browser-final.log |
| Existing HUD/normal dispatch browser regressions | 5 passed | 18.6s runner; 21.19s command wall |
| Production build / TypeScript | Passed on final production source | 11.48s wall; SSR 279ms; detailed client phase in build-final.log |
| ESLint | Passed | 3.17s wall |
| Prettier source check | Passed | 3.43s wall |
| Contracts including real Tutorial/NPC fixtures | Passed | 3.58s wall |
| Architecture boundaries | Passed | 0.19s wall |
| Diff whitespace | Passed | No timing benchmark claimed |
| Final manual rendered interactions/captures | Completed, no page errors | Preparation/execution not independently benchmarked; capture logs retained |

Logs and evidence live in `test-results/chat-5/`. Routine engine/database checks
were deliberately not duplicated. Chat 6 owns the final combined regression and
acceptance pass. Two newly added broad browser scenarios were removed under the
one-repair rule, as fully recorded above: dispatch→return→report and the expanded
receipt→history scenario. Do not count their earlier successful assertions as
retained tests. Pure selection/request/receipt/report tests and existing ordinary
dispatch/HUD browser regressions retain cheaper protection; final manual inspection
covers the required actual visual interactions. There is no unresolved UI blocker,
but final integrated acceptance is not claimed by this handoff.

No CI, runner queue, PR or merge wait occurred. Every task Vite/browser process
has closed; process inventory has no Chat 5 job remaining. No database cleanup was
needed. Normal build caches, dist output and ignored local evidence remain. All
Chats 1–4, 3x defaults and Chat 6's separately owned test edits are preserved.

### Exact source evidence

Base remains detached `a4b2dcab0847182244c0afae1f5783c6a9a27b33`. Final UI/contracts/test-source fingerprint: `aae1e74f4f8b4fe55bfe64b451953b8ed53ab3f4ab20b9d0e7b04a1f7a9579c5` (74 changed/untracked relevant files). Algorithm: SHA-256 of compact sorted-key JSON mapping paths to SHA-256 of file bytes. Exact manifest: `/Users/ethan/.codex/worktrees/d2d8/orbit-imperium/test-results/chat-5/source-manifest.json`. Scope includes apps/web, contracts, playwright.config.ts and the contract checker; it intentionally excludes concurrently authored Rust test files and docs. No production source change follows this fingerprint.

### Canonical screenshot inventory

This table is the **only canonical delivery set**: one current desktop/mobile pair
per listed screen or distinct state. Viewports are 1440x900 and 390x900. Full-page
images can be taller; exact pixel dimensions and hashes are recorded in
`test-results/chat-5/canonical-screenshots.json`. All canonical captures were inspected
and none predates its relevant final UI fix. Focused viewports intentionally retain
the actual post-interaction scroll; normalized full-page artifacts are separate.
In particular, focused history is captured before normalization and completion uses
the concise viewport, not the long expanded 27-receipt image.

| Screen/state | Framing | Desktop 1440x900 | Mobile 390x900 |
| --- | --- | --- | --- |
| Opening and first next action | viewport | [Desktop](/Users/ethan/.codex/worktrees/d2d8/orbit-imperium/test-results/chat-5/opening-viewport-1440x900.png) | [Mobile](/Users/ethan/.codex/worktrees/d2d8/orbit-imperium/test-results/chat-5/opening-viewport-390x900.png) |
| Ordinary building detail | viewport | [Desktop](/Users/ethan/.codex/worktrees/d2d8/orbit-imperium/test-results/chat-5/building-detail-viewport-1440x900.png) | [Mobile](/Users/ethan/.codex/worktrees/d2d8/orbit-imperium/test-results/chat-5/building-detail-viewport-390x900.png) |
| Ordinary research detail | viewport | [Desktop](/Users/ethan/.codex/worktrees/d2d8/orbit-imperium/test-results/chat-5/research-detail-viewport-1440x900.png) | [Mobile](/Users/ethan/.codex/worktrees/d2d8/orbit-imperium/test-results/chat-5/research-detail-viewport-390x900.png) |
| Ordinary manufacture detail | viewport | [Desktop](/Users/ethan/.codex/worktrees/d2d8/orbit-imperium/test-results/chat-5/manufacture-detail-viewport-1440x900.png) | [Mobile](/Users/ethan/.codex/worktrees/d2d8/orbit-imperium/test-results/chat-5/manufacture-detail-viewport-390x900.png) |
| Optional guidance in full interface | viewport | [Desktop](/Users/ethan/.codex/worktrees/d2d8/orbit-imperium/test-results/chat-5/full-guidance-viewport-1440x900.png) | [Mobile](/Users/ethan/.codex/worktrees/d2d8/orbit-imperium/test-results/chat-5/full-guidance-viewport-390x900.png) |
| Earned receipt while on progression | viewport | [Desktop](/Users/ethan/.codex/worktrees/d2d8/orbit-imperium/test-results/chat-5/earned-on-progression-viewport-1440x900.png) | [Mobile](/Users/ethan/.codex/worktrees/d2d8/orbit-imperium/test-results/chat-5/earned-on-progression-viewport-390x900.png) |
| History opened and focused after navigation | focused viewport | [Desktop](/Users/ethan/.codex/worktrees/d2d8/orbit-imperium/test-results/chat-5/history-link-focused-viewport-1440x900.png) | [Mobile](/Users/ethan/.codex/worktrees/d2d8/orbit-imperium/test-results/chat-5/history-link-focused-viewport-390x900.png) |
| First personal site briefing | full page | [Desktop](/Users/ethan/.codex/worktrees/d2d8/orbit-imperium/test-results/chat-5/site-briefing-1440x900.png) | [Mobile](/Users/ethan/.codex/worktrees/d2d8/orbit-imperium/test-results/chat-5/site-briefing-390x900.png) |
| Cargo operation briefing | full page | [Desktop](/Users/ethan/.codex/worktrees/d2d8/orbit-imperium/test-results/chat-5/cargo-briefing-1440x900.png) | [Mobile](/Users/ethan/.codex/worktrees/d2d8/orbit-imperium/test-results/chat-5/cargo-briefing-390x900.png) |
| Private destination and ship selection | full page | [Desktop](/Users/ethan/.codex/worktrees/d2d8/orbit-imperium/test-results/chat-5/site-dispatch-1440x900.png) | [Mobile](/Users/ethan/.codex/worktrees/d2d8/orbit-imperium/test-results/chat-5/site-dispatch-390x900.png) |
| First operation review and unobscured launch | focused viewport | [Desktop](/Users/ethan/.codex/worktrees/d2d8/orbit-imperium/test-results/chat-5/site-review-focused-1440x900.png) | [Mobile](/Users/ethan/.codex/worktrees/d2d8/orbit-imperium/test-results/chat-5/site-review-focused-390x900.png) |
| Cargo operation review and unobscured launch | focused viewport | [Desktop](/Users/ethan/.codex/worktrees/d2d8/orbit-imperium/test-results/chat-5/cargo-review-focused-1440x900.png) | [Mobile](/Users/ethan/.codex/worktrees/d2d8/orbit-imperium/test-results/chat-5/cargo-review-focused-390x900.png) |
| Committed departure result | focused viewport | [Desktop](/Users/ethan/.codex/worktrees/d2d8/orbit-imperium/test-results/chat-5/site-submitted-focused-1440x900.png) | [Mobile](/Users/ethan/.codex/worktrees/d2d8/orbit-imperium/test-results/chat-5/site-submitted-focused-390x900.png) |
| Returning fleet with retired site identity | viewport | [Desktop](/Users/ethan/.codex/worktrees/d2d8/orbit-imperium/test-results/chat-5/returning-fleet-viewport-1440x900.png) | [Mobile](/Users/ethan/.codex/worktrees/d2d8/orbit-imperium/test-results/chat-5/returning-fleet-viewport-390x900.png) |
| NPC report inbox preview | viewport | [Desktop](/Users/ethan/.codex/worktrees/d2d8/orbit-imperium/test-results/chat-5/npc-inbox-viewport-1440x900.png) | [Mobile](/Users/ethan/.codex/worktrees/d2d8/orbit-imperium/test-results/chat-5/npc-inbox-viewport-390x900.png) |
| Named NPC encounter, loot and local debris | full page | [Desktop](/Users/ethan/.codex/worktrees/d2d8/orbit-imperium/test-results/chat-5/npc-report-1440x900.png) | [Mobile](/Users/ethan/.codex/worktrees/d2d8/orbit-imperium/test-results/chat-5/npc-report-390x900.png) |
| Delivered raid cargo report | viewport | [Desktop](/Users/ethan/.codex/worktrees/d2d8/orbit-imperium/test-results/chat-5/returned-report-viewport-1440x900.png) | [Mobile](/Users/ethan/.codex/worktrees/d2d8/orbit-imperium/test-results/chat-5/returned-report-viewport-390x900.png) |
| Reinvestment recommendation | focused viewport | [Desktop](/Users/ethan/.codex/worktrees/d2d8/orbit-imperium/test-results/chat-5/reinvestment-focused-1440x900.png) | [Mobile](/Users/ethan/.codex/worktrees/d2d8/orbit-imperium/test-results/chat-5/reinvestment-focused-390x900.png) |
| Opening complete with full interface | focused viewport | [Desktop](/Users/ethan/.codex/worktrees/d2d8/orbit-imperium/test-results/chat-5/completion-guidance-viewport-1440x900.png) | [Mobile](/Users/ethan/.codex/worktrees/d2d8/orbit-imperium/test-results/chat-5/completion-guidance-viewport-390x900.png) |
| Direct hidden-route escape | viewport | [Desktop](/Users/ethan/.codex/worktrees/d2d8/orbit-imperium/test-results/chat-5/hidden-route-escape-viewport-1440x900.png) | [Mobile](/Users/ethan/.codex/worktrees/d2d8/orbit-imperium/test-results/chat-5/hidden-route-escape-viewport-390x900.png) |
| Command HUD modal | viewport | [Desktop](/Users/ethan/.codex/worktrees/d2d8/orbit-imperium/test-results/chat-5/hud-open-viewport-1440x900.png) | [Mobile](/Users/ethan/.codex/worktrees/d2d8/orbit-imperium/test-results/chat-5/hud-open-viewport-390x900.png) |
| Missing-ship recovery | focused viewport | [Desktop](/Users/ethan/.codex/worktrees/d2d8/orbit-imperium/test-results/chat-5/site-missing-ships-focused-1440x900.png) | [Mobile](/Users/ethan/.codex/worktrees/d2d8/orbit-imperium/test-results/chat-5/site-missing-ships-focused-390x900.png) |
| Insufficient-fuel recovery | focused viewport | [Desktop](/Users/ethan/.codex/worktrees/d2d8/orbit-imperium/test-results/chat-5/site-fuel-recovery-focused-1440x900.png) | [Mobile](/Users/ethan/.codex/worktrees/d2d8/orbit-imperium/test-results/chat-5/site-fuel-recovery-focused-390x900.png) |
| Retirement invalidates open review | focused viewport | [Desktop](/Users/ethan/.codex/worktrees/d2d8/orbit-imperium/test-results/chat-5/site-retired-recovery-focused-1440x900.png) | [Mobile](/Users/ethan/.codex/worktrees/d2d8/orbit-imperium/test-results/chat-5/site-retired-recovery-focused-390x900.png) |
| Guidance error with usable ordinary interface | viewport | [Desktop](/Users/ethan/.codex/worktrees/d2d8/orbit-imperium/test-results/chat-5/guidance-error-viewport-1440x900.png) | [Mobile](/Users/ethan/.codex/worktrees/d2d8/orbit-imperium/test-results/chat-5/guidance-error-viewport-390x900.png) |
| Guidance loading with usable ordinary interface | viewport | [Desktop](/Users/ethan/.codex/worktrees/d2d8/orbit-imperium/test-results/chat-5/guidance-loading-viewport-1440x900.png) | [Mobile](/Users/ethan/.codex/worktrees/d2d8/orbit-imperium/test-results/chat-5/guidance-loading-viewport-390x900.png) |
| Ordinary dispatch with corrected mobile HUD | full page | [Desktop](/Users/ethan/.codex/worktrees/d2d8/orbit-imperium/test-results/chat-5/standard-dispatch-1440x900.png) | [Mobile](/Users/ethan/.codex/worktrees/d2d8/orbit-imperium/test-results/chat-5/standard-dispatch-390x900.png) |
| Ordinary Galaxy with corrected mobile HUD | full page | [Desktop](/Users/ethan/.codex/worktrees/d2d8/orbit-imperium/test-results/chat-5/standard-galaxy-1440x900.png) | [Mobile](/Users/ethan/.codex/worktrees/d2d8/orbit-imperium/test-results/chat-5/standard-galaxy-390x900.png) |

Everything else in this evidence directory is supplemental, not another required
canonical delivery image: `before-*` are historical baseline, alternate full-page
and `*-viewport` duplicates are inspection support, `completion-history-*` are the
long ledger diagnostic, `npc-rounds-*`, `site-rules-*` and `chapter-progress-*` show
expanded disclosures. Those disclosures were also exercised and inspected. Scripts,
logs, capture-errors.json and source manifests are diagnostics. Originals are
preserved; no screenshot was uploaded or hosted.

**Ownership is released now.** Root may hand runtime/shared integration to Chat 6.
No further Chat 5 writer or running validation job remains.
