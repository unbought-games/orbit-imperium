# Dispatch, Galaxy, fleets and mission controls — stream 03

Owner chat: `01a1d61e-5bb1-79f3-8182-afcea36275c9`. Branch:
`emick/dispatch-fleet-migration`. Started from main
`e9de5904c7132b07b24a89918a8b0415ebea0199` on November 13, 2026.
This is the focused handoff for the
[published audit](https://github.com/unbought-games/orbit-imperium/blob/4b73b479d427fad0b3877f510a3773346d27ccdb/docs/verification/e2e-migration/workstreams/03-dispatch-and-fleets.md).
The audit remains on its documentation branch; no other stream's status or
implementation is imported here. No deployment or protection changes.

## Complete case reconciliation

- [Frozen current dispositions](test-migration-dispatch-fleets-cases.csv): all
  120 application and 99 component identities, including full title ancestry,
  original IDs, exact retained/replacement tests and explicit browser gaps.
- [Historical dispositions](test-migration-dispatch-fleets-baseline.csv): all
  241 original application identities, preserving phase-one retirements and
  their [Dispatch](test-migration-dispatch.md),
  [Galaxy/fleet](test-migration-galaxy-fleets.md),
  [profile/alliance](test-migration-shell-profiles.md) and
  [report](test-migration-reports.md) evidence.
- [Delta identities](test-migration-dispatch-fleets-delta.csv): current-main
  additions and newly mounted replacements, with predecessor IDs. Delta IDs
  are `delta-` plus the first 16 SHA-256 hex characters of `file|title_path`.
  Main added four probe-preference cases, two Arrival recruitment cases, and
  two Enter-review component cases since the frozen audit. The #407 fleet-card
  Galaxy-link assertions and #412 Enter/IME/repeat-key assertions remain intact.

The resulting required selection is **109 application cases and 110 component
cases**, across the same 13 application files and five component files. From
current main's 126 application and 101 component cases, this removes 17
application executions and four duplicate component executions, adding 13
component cases. No test is skipped, quarantined, made optional or silently
excluded from the runner. The ordinary paths use `/u/<universe>/b/<body>/<page>`;
no selected-body query is generated. The existing CI union and global cutover
remain owned by stream 10.

Every owned case has a final disposition. This is not a claim that the global
small application gate is finished, or that counting tests measures speed or
reliability. Retained application cases remain required, with their caller
contract in the ledger; they are not unfinished tests silently deferred to an
optional suite. No production UI or business logic changed.

## Boundaries and retained assertions

Dispatch's real `DispatchRequests`, cancellable advisory reads and Coordinator
already provide the production seams. The prepared scene now holds actual
`GamePort` quote/command promises and returns typed Pending/Rejected receipts.
The real `useDispatch`, `DispatchView`, `DispatchFeedback` and `ErrorBanner`
render submitting, accepted-pending, rejected and editable draft states. The
application uncertain-order case remains required for lost HTTP delivery,
receipt polling, Retry, exactly one departure and eventual committed reset.
The successful reviewed launch and edited historical Deploy journeys still
prove paired command/terms and selected-origin routing.

The three colony feedback cases now use the same real form and controllers.
They retain locked-position disabling, recovery on an eligible position,
occupied resolution without a quote, contextual Astrophysics errors, no false
launch/review, and error preservation after the advisory estimate settles.
A controlled resolver rejection independently proves that an occupied position
never requests terms. Exact error/position permutations remain deterministic.

The new `quick-fleet` scene mounts the real quick-action hooks, responsive
Harvest action/form and Coordinator. Only external ports and initial snapshots
are prepared. Its selection key changes on a new opening, matching Galaxy;
closing changes the real hook's `open` input. A held quote is explicitly
completed after Escape and cannot launch. Both resource/slot blockers preserve
disabled Send/input and enabled Customize; native invalid counts, focus return,
quote failure and no-probe explanations remain observable. Deterministic
harvest tests explicitly release quotes after closure, binding, inventory and
slot changes. Reservations continue to derive from the shared attempt ledger.

The component audit retains destination picker keyboard selection, clipboard
and native input, focus return, distinct one-way/conditional/debris reviews,
ship/cargo disclosures, breakpoints, sheet/popover behavior and real card links.
Only Transport/Espionage replays of the common review shell and desktop
replays of non-geometric homeworld/refresh schedules are consolidated. Mission
labels and conditional timing still have exact model/static tests; Attack,
Deploy, Colonize and Harvest preserve distinct review interactions. No native
focus or keyboard claim is made from static markup alone.

Actual Spy, mobile Harvest, desktop Enter-to-Harvest and paid-scan journeys
remain. So do Galaxy history and selected-origin/context transitions,
preference save/reload and failure recovery, moon/parent command bindings,
missile identity replacement, owned inventory/Shipyard navigation, arrival
landing, group commands and each actual keyed fleet-list consumer. Per-case
reasons in the ledger distinguish these from arithmetic/permission proof.
The 390px fleet lifecycle is consolidated into the tighter 320px application
case plus the existing 390px card interaction; desktop remains. Cooldown HTTP
schedules run at 390px; desktop native surfaces retain their component checks.

## Real server contracts

No mocked command success establishes authorization, payment or persistence.
No Rust code or server test selection changed. Existing real suites are
validated independently:

| Boundary | Named evidence |
| --- | --- |
| Client reservation/reconciliation | `game-projection.test.ts`: `reserves fleet cargo, fuel and stationed ships together without losing wealth during confirmation`; `uses one fleet confirmation gate for pending commands, resources, stationed ships and global slots`; `blocks a fleet when its live origin inventory cannot fulfill the manifest`; `requires the current group revision and joining window on a submitted fleet quote` |
| Actual group ownership, joins and recall | Engine `attack_groups`: `bounds_count_active_fleets_and_distinct_owners_and_hide_unauthorized_groups`; `invitations_are_initiator_only_respect_blocks_and_invalidate_join_quotes`; `joined_fleets_fight_once_and_return_independently`; `recall_keeps_delay_closes_joining_and_uses_uncapped_elapsed_time` |
| Moon identity and local inventory | Engine `moons`: `lunar_launch_requires_local_fuel_and_recall_restores_only_its_moon`; `lunar_transport_all_body_pairs_preserve_stock_lineage_and_return_once`; `lunar_attack_and_spy_ignore_parent_defenders_and_never_create_a_moon`; client `quick espionage preserves a moon target at its parent coordinates` |
| Durable group command/replay | PostgreSQL `attack_groups`: `invited_group_join_restart_battle_reports_and_returns_in_both_runtimes`; `pending_invitation_declares_homeworld_before_any_join`; `presentation_commands_preserve_pending_flight_and_economy` |
| Durable missile payment/impact | PostgreSQL `missile_warfare`: `missiles_manufacture_launch_intercept_restart_and_audit_in_both_runtimes` |
| Paid scan, auth and exactly once | PostgreSQL `phalanx`: `serial_and_scoped_paid_scan_dedup_recovery_and_recipient_history`; `membership_revalidation_and_atomic_fault_recovery_do_not_duplicate_observations`; `http_scan_is_explicit_paid_post_with_csrf_and_free_authorized_report_reads` |
| Colony races and persistence | PostgreSQL `colonization`: `colony_creation_is_atomic_replayable_private_and_usable_after_restart`; `concurrent_arrivals_serialize_both_coordinate_and_player_capacity`; `signup_waits_for_earlier_colony_claim_and_reselects_without_partial_membership` |

## Failure and repair history

1. **Previously failed desktop moon tour — retired.** Main run
   [43359549586](https://github.com/unbought-games/orbit-imperium/actions/runs/43359549586),
   attempt 1, revision `7b2fa0612740ca40ad579a02e460a912f0e9da03`, job
   `131669658465`, artifact `14006839869`. The spy request correctly targeted
   the moon; the dialog was absent after a conditional `isVisible`/click.
   Inspected the retained DOM/screenshot/log, `GalaxyMoon`/Popover and history
   (`34c36a1e`, `6292946b`, `3040d3fc`). The exact asynchronous mechanism is
   unconfirmed; no infrastructure explanation or repair is invented. Under
   AGENTS, remove the unexplained failed desktop variant. The unchanged mobile
   variant passes. The new deterministic test proves exact Moon intent, not
   desktop popup reopening. Lost: the desktop spy → reopen → Attack tour.
2. **New Pending receipt fixture — one repair passed.** First focused run:
   3 passed, 1 failed (4.148s preparation, 7.6s runner). The new Pending receipt
   incorrectly set `executed_at` to a number, violating the discriminated
   contract (also caught by component TypeScript); Coordinator rejected it.
   Set Pending `executed_at: null`. Focused repair: 1 passed (1.3s runner), then
   all 110 components passed. This is a fixture defect, not a product regression
   or retry-for-luck. First artifacts retained in
   `/tmp/orbit-stream03/feedback-first/` and logs in `/tmp/orbit-stream03/`.
3. **Existing Arrival synthetic pointer event — one repair passed.** First
   application run: 108 passed, desktop `a new empire chooses its title, look
   and name, then lands in Briefing at 1280px` failed at look 4 (saw look 3).
   `new PointerEvent('pointerdown')` defaults to non-bubbling; React delegates
   the handler to the root. The event therefore never clears the carousel's
   keyboard-scroll target, and the later scroll can be ignored if that earlier
   scroll has not settled. The screenshot shows the old selected art off-center
   after scrolling. History (`4083365f`, `fba82df4`) and the repair ledger contain
   no prior repair for this case. Add `bubbles: true` to the synthetic event;
   both widths then passed with unchanged selection, centering, save payload,
   input validation and landing assertions. Repository search found no other
   `new PointerEvent('pointerdown')` caller. No production change, delay,
   timeout increase or repeated unchanged run. Retained initial evidence:
   `/tmp/orbit-stream03/application-first/`; repair log `arrival-repair.log`.
4. **Disposable DB setup infrastructure — recovered.** Docker's automatic
   address pool was exhausted before any database tests started. Inspected
   existing network subnets and used task-only `10.253.243.0/28` in a temporary
   Compose override. Existing networks/containers were not removed. Task container, volume and network were removed successfully after all four binaries passed. Project
   `orbit-stream03`, dynamic loopback port `55068`, DB_JOBS=2; each binary has
   its own disposable database and serial tests. This does not consume a test
   repair. Cleanup is recorded with validation below.

Prior exhausted create/invite/join/requote/recall, rapid Galaxy toast and
supporter-expiry tours remain retired. This work does not recreate the failed
combined-modality tooltip migration. The independently surviving hover/keyboard
and touch status tests are still required. Preserve prior fleet-card timer-label,
Galaxy container-gutter and Dispatch fixture repair history from the linked
phase-one records; migration does not reset their repair allowances.

## Validation

Local pinned Node 24.18.0/npm 11.16.0, Rust 1.99.0 and Nextest 0.9.114.
This chat owned validation; process inspection found no overlapping browser,
production build or full typecheck. Browser suites/builds were serial. Native
engine and database validation reused the existing Cargo target cache; no
custom scheduler or process registry. Local runner allocation wait was zero;
preparation and execution are separated below.

| Check | Result | Preparation / execution |
| --- | --- | --- |
| 22 focused client files | 384 passed | 0.953s Vitest total |
| Focused Dispatch feedback | 3 passed, 1 fixture failure; repaired Pending passed | 4.148s preparation / 7.6s initial; 1.3s repaired runner |
| New colony controls and closed-quote hook | 4 passed | 3.573s / 4.2s |
| All five owned component files, with diagnostic captures | 110 passed | 3.651s / 54.8s |
| All 13 owned application files | 108 passed, 1 Arrival fixture failure | 4.540s / approximately 114s |
| Both Arrival repair variants | 2 passed | 5.097s / 2.5s |
| Engine missions, colonization and phalanx | 171 passed | 14.61s compile / 5.268s runner |
| PostgreSQL attack_groups, missile_warfare, phalanx, colonization | 23 passed | 48.81s compile; 40.644s / 11.304s / 69.955s / 17.720s per-binary runner (two concurrent binaries) |
| Source ESLint/Prettier, Rust formatting, application/component TypeScript, contracts and boundaries | Passed after the cleanup below | Phase totals not separately captured |
| CI workflow and boundary policy | 14 passed | 1.344s runner |
| Production frontend build and prerender | Passed | Vite 4.37s + prerender Vite 1.15s; full setup/typecheck total not separately captured |
| Narrowed HTTP uncertain journey after removal of unused outcome branches | 1 passed | 3.6s runner |

Executable revision: `6a8b2c6d28221a20df6814ae54c5df397bc0f17c`.
The local commands above ran on base `e9de5904` plus the changes committed there.
The full component pass preceded removal of an unreachable Espionage comparison
left by matrix consolidation; component TypeScript then passed. The first build
stopped before compilation because the new internal note lacked YAML frontmatter;
the note now has valid frontmatter and `draft: true`, so it does not add technical
implementation prose to the player update feed. The production build then passed.
An unrelated regenerated analytics route deletion was inspected and restored;
it is not included in this migration. The existing successful source checks
were not repeated merely to obtain a single all-green log.

PR-head, review and merge-group outcomes are recorded in the PR's validation
section and GitHub checks. This local record does not preclaim remote success.
Green checks at one revision are not evidence for a later revision. No full-system acceptance or deployment was requested or
run. No production UI changed; visual acceptance of a changed product screen
is not applicable. Existing desktop/mobile component and Arrival captures were
inspected as additional evidence, without claiming a prepared gallery proves
application routing or backend behavior.

## Cross-owner handoff

- **05 shell:** `shell.spec.ts` is untouched. Its `legacy fleets retain
  trajectory, exact arrival and reviewed recall` remains required; the real
  `fleet-card.component.spec.ts` article/list controls and the named fleet
  reservation units are available evidence, not permission to remove shell
  caller wiring.
- **06 HUD:** the separate HUD-caption failure in main run `43359549586`, job
  `131669658426`, artifact `14007912034`, remains with stream 06. This PR does
  not claim it was fixed. Existing shell launch recovery and retired rapid
  toast/native-touch histories are unchanged.
- **04/08:** Empire wealth navigation and group/delivery report consumers in
  owned stream-03 files remain required. No lifecycle or report-fact migration
  in their files was launched.
- **09/10:** only the domain scene registration `quick-fleet` is added to the
  shared component entry. No harness policy or CI selection change. Consume
  these ledgers when reconciling the final global gate; all other streams and
  unmigrated required tests retain their existing status. No indispensable
  shared implementation change or independent unassigned reliability fix was
  discovered. Global acceptance/five natural post-cutover lifecycle evidence
  is outside this stream's completion claim.
