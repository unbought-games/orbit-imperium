# Stream 04 — Empire, lifecycle and settings

This is the focused implementation handoff for audit stream 04. The audit remains
on `origin/emick/test-migration-audit` (`94a778a073848c58998780d1816d1c0fb07fe786`);
its frozen baseline is `0c235fd6d27422374abf61ea44e39c015a9c1675`. This work starts
from main `816b01c197fcb53d768141d9c3db3445f9fbc4fc`, in chat
`01a1e652-17b2-7ae2-b2b5-92de627738e4`, branch
`emick/test-migration-empire-settings`. Other streams' status is unchanged.

## Boundaries and case accounting

- [Current ledger](test-migration-empire-settings/current.csv): all 69 frozen rows
  (56 application, 13 components), preserving original IDs and full titles.
- [Historical ledger](test-migration-empire-settings/baseline.csv): all 66 original
  application rows, including prior phase-one migrations and retirements.
- [Delta ledger](test-migration-empire-settings/delta.csv): current-main changes
  and new test identities, including predecessor links where applicable.
- [Final browser cases](test-migration-empire-settings/final-cases.csv): 22
  required application cases and 41 required isolated cases, all executed.
  Counts are accounting, not a coverage target. Main had 54 owned application
  cases and 13 owned components immediately before this assignment.

`StationedUnits` and `EmpireWealth` are extracted unchanged from the actual
Empire overview. Static rendering now protects positive/present inventory,
empty/singular/large totals, and wealth source labels and amounts. Existing
`empireTotals`, `empireFlights`, `bodyTraffic`, physical-facts and fleet-cargo
tests retain exact arithmetic, current versus launch cargo, ownership, body
identity and legacy protocol behavior. Queue/fleet assets cannot enter the
stationed component because its sole source is the body's inventory.

`activeWorkLabel` is the production projection of upgrade/demolition/research,
pending/cancelling and elapsed-but-unconfirmed labels. Static artwork tests
retain Facilities/Defense identity differences without multiplying browser
cases. Real `WorkSummaries`, `ActiveWorkCard`, cancellation dialogs and the real
Coordinator remain mounted for responsive layouts, normal/reduced motion,
refund review, Escape/focus and observable clock updates. One application case
retains the projected-deadline summary-to-catalog route.

The Empire component scene uses a minimal memory router and the real Coordinator,
selectors, store subscriptions and controls. Only the external game port is
controlled; there is no application bootstrap or API client. Native links update
the memory route; this proves activation/href, not destination rendering.
Application journeys retain actual selected-body paths, research detail/history,
fleet overview/list/detail composition and external profile delivery. Four
full-shell layout cases remain in the application suite after failed component
migrations (below). Static history presentation tests cover all event types,
recorded commander precedence and unknown facts; public route/no-bootstrap and
emblem-retention consumers remain application tests.

Actual lifecycle controls retain safe destructive review, cancellation and focus.
The new rename component test exercises a local draft while an authoritative
name changes, pending submission and uncertain delivery using the real hook and
Coordinator. Actual vacation/deletion hooks retain uncertain commands as pending
and prevent duplicate submission. Existing settings presentation cases still
cover blockers, refusal/rejection, inactivity, authoritative updates and review
reset. Their props are presentation inputs, not a mock of server authorization.
The five tutorial component cases remain unchanged in behavior; their scene now
uses a minimal router rather than importing the application route graph. Tutorial
application migration belongs to stream 06.

## Current-main contracts and historical gaps

- #444 (`320b4836`): preserve personalized Empire name and emblem controls. No
  identity editing, entitlement or cosmetic loader changes are made here.
- #436 (`1b70a509`): retain the added public profile emblem-expiry consumer test.
- #439 (`c5f1f30a`): retain current Base UI overlay composition. Confirmation,
  focus and tooltip cases exercise the actual controls.
- #445 (`816b01c1`): retries exist only in memory; Settings no longer renders
  OrderRecovery and legacy storage is deleted without replay. Historical audit
  language about restoring pending orders is obsolete. This change introduces
  no storage adapter, persistence assertion or restored pending-command journey.
  Browser reload checks concern confirmed server state only.
- The desktop vacation minimum/return journey stays retired. Its earlier
  screenshot-helper and response-gating repairs were exhausted (job
  `129904355556`, artifact `13774304482`). The surviving mobile journey passed.
- Main #415 retired the unexplained rename-close-after-pruning and ghost-control
  startup cases (run `43476074871`, job `132060393826`). Their precise browser
  sequences remain gaps; the new draft test does not recreate or replace them.
- Main #407 replaced the Flight path disclosure with inline route links. The
  old named-route disclosure assertion is obsolete; recorded-coordinate/current
  name semantics remain in `mission-presentation.test.ts`, and stream 03 owns
  current fleet-route consumers.

## Server invariants

Fixture success is not proof of persistence or authorization. The implementation
changes no server contracts. The following existing production-boundary suites
are validated, rather than duplicating their rules in browser fixtures:

| Suite | Exact tests and invariants |
| --- | --- |
| engine `missions::vacation` | `vacation_settles_all_bodies_preserves_settings_and_enforces_exact_minimum`; `incomplete_collections_cannot_certify_entry_and_vacation_blocks_work`; `all_work_categories_and_paid_future_batches_block_entry`; existing inbound, fusion/moon, migrated interval and paid-hold cases |
| engine `missions::colonization` | `abandonment_rejects_homeworld_foreign_body_changed_losses_and_dependent_flights`; `abandonment_research_guard_includes_irn_contributors_and_last_planet`; `abandonment_destroys_stationed_assets_and_moon_terminalizes_queues_and_preserves_debris`; replay/strict UTC release and incoming transport cases |
| PostgreSQL `empire_deletion` | `explicit_deletion_cancellation_restart_and_account_preservation`; `http_requires_recent_signin_and_retries_do_not_require_new_authentication`; `automatic_cleanup_respects_vacation_and_foreground_return`; `vacation_entry_exit_replay_and_cleanup_share_one_policy_and_timer`; `vacation_http_uses_normal_auth_and_returns_private_status`; `vacation_and_launch_at_same_time_have_one_serialized_winner`; operator/migration/retained-world cleanup cases |
| PostgreSQL `colonization` | `colony_abandonment_persists_losses_cancels_work_and_releases_slot_after_restart`, plus the binary's colony creation, race and restart cases |
| PostgreSQL `planet_names` | `planet_names_survive_restart_publish_to_other_players_and_retry_once` |
| PostgreSQL `empire_history` | `curated_history_survives_report_cleanup_empire_removal_closure_and_account_detachment`; `revisions_membership_epochs_and_paginated_selection_do_not_leak_history`; `http_requires_origin_csrf_and_owner_and_never_bootstraps_anonymous_gameplay`; `empire_identity_enforces_ownership_revision_grants_and_retains_missing_selections`; event-time archive and identity HTTP cases |

## Failures and repair allowances

1. **Local setup, not a test:** first npm invocation used the host's Node 23 and
   was blocked by the original sandbox before installation. Switched to pinned
   Node 24.18.0/npm 11.16.0 with full access; dependency setup took 4s.
2. **New active-work scene contract defect:** the first component run supplied
   four production records for one body. `validateInitialGame` rejected it before
   rendering. Eleven active-work cases failed; the partial run was cancelled
   (exit 130), so no aggregate success is claimed. A temporary deterministic
   diagnostic reproduced `completeProduction` rejection. One repair maps
   production records to the supplied bodies. The diagnostic then passed and
   all eleven original replacements passed. Logs: `/tmp/stream04-components-first.log`,
   `/tmp/stream04-runtime-repair.log`, `/tmp/stream04-components-repair.log`.
   The cancelled run did not finish its JSON/trace report; available screenshot
   output was inspected. Source application tests remained until replacements
   passed. The shipyard scene's application `goBack` was also removed: its memory
   router already owns navigation and the browser history is outside that scene.
3. **New migration recurrence, originals preserved:** 28 components passed without
   captures. With capture enabled, two replacements failed page overflow:
   `desktop and phone command views keep all information readable without horizontal scrolling`
   and `fleet movements stay visible and fit the page with long names and manifests`.
   The scene lacked the shell work-area class (container sizing and word wrap).
   Its one repair restored that caller class, but both failed again. Thus the
   proposed cause was insufficient; no product cause is established. Removed
   both component replacements and restored the original required application
   scenarios, following `test-design/references/browser-contracts.md`. Both
   original cases passed with capture. Do not revive the failed replacements
   under new names. Traces/screenshots are retained under
   `/tmp/stream04-evidence/components-capture-failure` and
   `/tmp/stream04-evidence/components-layout-recurrence`; logs are
   `/tmp/stream04-components-final.log` and `/tmp/stream04-layout-repair.log`.
4. **Authoring type errors:** the initial profile stub lacked binding/request ID;
   the scene input type inferred overly narrow construction types; production
   settings widened numeric literals. Fixed the typed fixtures without changing
   assertions or runtime policy. These are not flaky-test or product incidents.
5. **Self-review fixture alias:** initialization now clones the external snapshot,
   so later fixture edits cannot mutate the Coordinator view before refresh
   delivers them. Revalidate the affected component boundary after this fix.
6. **Local Docker infrastructure:** disposable Compose startup failed because
   Docker's default address pools were exhausted. No existing network/container
   was removed. Inspected allocated subnets and supplied an unused `10.254.4.0/24`
   in a temporary Compose override scoped to `orbit-stream04`. A diagnostic
   script initially mishandled Docker's null IPAM config; corrected it before
   creating the override. The database then started on port 55078.

No retries-for-luck, sleeps, increased timeouts, quarantine, configured execution
deadlines or protection changes were introduced. The full-shell migration gaps
are explicit retained coverage, not silent assertion loss.

## Validation and cleanup

Validation owner: this chat. Machine inspection found no other active test/build
work, only an unrelated Vite preview (left untouched). Browser suites, full
TypeScript checks and builds ran serially. Full local checks reuse the existing
Cargo target cache, not another checkout's source. Native runners and Make own
all execution; no scheduler/process registry was added.

| Validation | Result | Preparation / execution |
| --- | --- | --- |
| Original wealth/climate visual baseline | 2 passed | 4.920s / 6.7s |
| New static inventory/wealth/history | 17 passed | 0.376s total |
| Active-work labels/artwork | 9 passed | 0.280s total |
| First repaired component batch | 28 passed | 4.012s / 15.2s |
| Lifecycle and existing tutorial/settings | 18 passed | 3.971s / 6.7s |
| First capture run | 43 passed, 2 failed | see retained log / 25.0s |
| Layout repair | 2 failed; replacements removed | 3.869s / see retained log |
| Final application suite | 20 passed | 4.593s / 26.1s |
| Final isolated suite with capture | 43 passed | 4.391s / 22.4s |

Final full-check, database, PR and queue evidence is appended below when complete.
Named captures include final running Empire (1672×1100 and 390×844 viewports,
full-page images), resource/research summaries (1440×1000 and 390×844), and
lifecycle review/uncertain states. Inspected images are displayed in the
originating chat; none are uploaded to the PR. This extraction changes no intended
visual design.

## Ownership handoff

- **05:** shell.spec.ts is unchanged. This stream retains four actual-shell Empire
  composition tests after rejected component migrations; do not silently remove
  them during shell work. Planet selection stays in canonical paths.
- **06:** existing tutorial-settings component file remains under 04 for this
  assignment; all five tutorial cases passed. Only its router scaffold changed.
  Tutorial application/HUD cases and the historical HUD recovery failure remain
  with 06. This is a finished serial handoff, with no overlapping edits.
- **07:** no broader identity/social migration. Delayed profile membership links
  and public emblem retention remain actual consumer journeys in 04.
- **09:** no shared fixtures/runners were modified. One lazy gallery registration
  and stream-owned runtime/data files are included. The original capture utility
  test remains in vacation.spec.ts and runs on setContent without bootstrap.
- **10:** use the ledgers to reconcile selection. All remaining tests are required;
  no global CI cutover is performed. The phase-one retirement gaps and failed
  component migrations remain visible. Five natural subsequent PR lifecycles
  remain a global reliability obligation, not a claim of this stream.

## Final local validation — November 16

Implementation/test source revision: `4c42f298ed346f4681895a19dfd6bf370d79dfcc`.
The following documentation-only follow-up repairs the news frontmatter and adds
results; it changes no implementation or test behavior. The application capture
run preceded the fixture snapshot-clone review fix; that fix affects only the
isolated runtime, which was revalidated afterward.

- `make check` passed tooling (130 passed, one conditional skip), client (222
  files / 1,969 tests), native (821 tests, 59 bridge-feature tests, 10 storage
  library tests), Clippy, Rust formatting, ESLint, Prettier, component TypeScript,
  contracts and boundary checks. The command then **failed** in `news:build`
  because the new note lacked YAML frontmatter. Added the required ID/title/date
  and reran the affected `npm run build` step successfully, including routes,
  application TypeScript, production Vite and prerender. No earlier step was
  skipped or called a pass on the failed command's behalf.
- Native compilation phases: 61s, 34.66s and 15.35s; execution phases: 33.036s,
  2.614s and 0.019s. Clippy: 46.63s. Client runner: 9.46s. Vite production build:
  6.23s; prerender build: 0.445s. Other local setup/wall-clock phase timings were
  not independently instrumented. Local runner allocation wait was zero.
- Focused strengthened static wealth assertion: 3 passed in 0.324s. It checks the
  metal group's own total, so another resource with the same value cannot make
  a missing reserved-cargo contribution pass.
- Final cloned-snapshot component validation: 43 passed, 20.9s runner; preparation
  is recorded in `/tmp/stream04-components-cloned.log`. This is required validation
  of the review fix, not an unchanged retry of the retired layout replacements.
- `make test-db DB_SUITES='empire_deletion empire_history planet_names colonization'
  DB_JOBS=2`: **29 passed**. Compile: 25.57s; Make's two isolated binaries incurred
  brief native Cargo lock waits (not separately timed). Serial execution within
  each database: deletion 16/56.726s, history 7/19.124s, names 1/7.048s,
  colonization 5/17.768s. Each test database was dropped by the native runner.
- Logs: `/tmp/stream04-check.log`, `/tmp/stream04-build.log`,
  `/tmp/stream04-db.log`, `/tmp/stream04-application.log`,
  `/tmp/stream04-components-accepted.log`, `/tmp/stream04-components-cloned.log`.
- Cleanup: all task-owned browser runners exited and removed their temporary
  bundles; `docker compose down --volumes --remove-orphans` removed only
  `orbit-stream04`'s container, volume and temporary-subnet network. No other
  chat's preview, container, network or source edits were changed. The build's
  unrelated pre-existing analytics-route generation drift was restored rather
  than included in this stream.

The merge gate remains required. No deployment, protection change, global test
selection cutover, paid-content distribution or persistent-order behavior is part
of this PR. Cross-owner notes above describe completed boundaries and retained
coverage; there is no pending shared-source implementation requiring another owner.

## PR #446 — first CI attempt and layout disposition

[PR #446](https://github.com/unbought-games/orbit-imperium/pull/446), head
`35d0cb249c0d6e4452ec5a9fcb3603db4d9a62c8`, first
[CI run 43969454161](https://github.com/unbought-games/orbit-imperium/actions/runs/43969454161)
passed native checks, all application shards and automated review. PostgreSQL
was correctly unselected by changed-path scope; the four relevant binaries were
executed locally. Components job `133657604346` failed two newly migrated cases
(438 passed, two failed, 4.5-minute runner):

- `fleet movements stay visible and fit the page with a single outbound flight`
  failed document overflow after changing to 768px.
- `research directive keeps whole-card pointer and keyboard links and becomes
  compact when idle` failed document overflow after changing to 1024px.

Both failures are in the new scene's full-page geometry checks, outside the
particular control being exercised. The scene's earlier work-area class repair
was already present. Its local passing reruns do not establish a reliable fix.
Inspected screenshots, error contexts and traces from artifact `14276844329`,
retained under `/tmp/stream04-evidence/ci-43969454161`. No external outage or
production defect is established. Under the exhausted shared-scene repair policy,
removed these component replacements and restored their original application
variants (single-flight and desktop research); no assertions were weakened.

The caller audit covers every `EmpireScenario` consumer. All intermediate-width
whole-page composition checks now remain in the real shell. Remaining isolated
checks cover owned control regions at explicit small/large widths, native
inventory disclosure, source-specific facts and focused lifecycle behavior.
There is no new shared harness change or unassigned repair. The four removed
migration replacements must not be reintroduced under new names. Actual-shell
counterparts remain required, so this causes no new browser-coverage gap.

Final accounting after CI disposition: **22 application, 41 isolated cases**.
Focused application validation passed all 22 in 22.1s; component validation and
exact revision are recorded in the final case ledger and subsequent PR checks.
The failed first CI attempt remains part of the outcome history. Queue enrollment
had not occurred, so queue removals remain zero at this point.

The CI-disposition validation passed: application preparation 6.024s, 22 cases
in 22.1s; component preparation 4.710s, 41 cases in 19.3s. Focused ESLint and
whitespace checks passed. No production source changed in this repair, so prior
native, database, production-build and visual evidence remains applicable.
