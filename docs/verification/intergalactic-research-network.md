# Intergalactic Research Network verification

Date: 2026-11-06. Base revision: `5f61be6982cc9b396aa29ae63553c35faa83d323`.
The implementation is an uncommitted working-tree change; no PR, queue, merge or
production activation was requested. The final changed-file content fingerprint
(excluding this verification record) is recorded below.

## Delivered behavior

Standard bundle 0.16.0 adds the existing IRN identity with reviewed costs and
prerequisites. Quotes, starts and operator-created research share deterministic
lab selection. Remote selection uses each technology's configured minimum, keeps
the origin, sorts by level then ID, and reads completed network levels only.
The effective total is derived; accepted lab inputs and deadlines remain immutable.
Legacy rules without IRN keep single-lab timing. Disabling new upgrades retains
earned capabilities. No schema migration or protocol expansion is needed.

The research inspector displays capacity and expandable lab contributions. Active
work exposes its snapshot from any planet. Research Lab technical data describes
linked timing only when the saved rules support IRN. Existing origin/contributor
abandonment guards, global lab locks and the one-player research slot remain.

## Validation and measured phases

These are local runner timings, not CI timings. No runner allocation queue was
involved; aggregate process startup/wait time was not measured separately where
the tool did not report it. Merge delay and queue removals are not applicable.

| Check | Preparation | Execution/result |
| --- | --- | --- |
| npm dependencies | 30 seconds | Installed with `npm ci` |
| Engine/application, all targets | 29.30 seconds | 597 tests passed in 10.334 seconds |
| Follow-up engine/application libraries and progression after new tests | 2.46 seconds | 221 tests passed in 7.026 seconds |
| Final six IRN progression vectors, including origin timing and remote lab race | 0.63 seconds | Six passed in 0.064 seconds |
| Client suite | Included in runner wall time | 1,409 passed; 6.69 seconds |
| New network client prerequisite/art test | Included in runner wall time | One passed; 0.158 seconds |
| PostgreSQL network gameplay/operator scenario | 41.75 seconds compilation | Passed in 7.793 seconds, both execution modes, restart, audit and export/import |
| Full PostgreSQL rules upgrade suite | 5.24 seconds compilation | All 40 passed in 436.933 seconds, including activation, signup initialization, custom rules and paid-work retention |
| Network and existing Hyperspace browser tests | 2.0 seconds module preparation | Nine passed in 13.8 seconds |
| Final network browser suite including Research Lab navigation | 1.966 seconds module preparation | Six passed in 7.1 seconds |
| Final viewport screenshot refresh | Module preparation separately logged | Six passed in 7.7 seconds |
| Clippy, engine/application/storage all targets | 27.10 seconds total | Passed with warnings denied |
| Final added vector test Clippy | 6.59 seconds total | Passed with warnings denied |
| Formatting, lint, contracts, boundaries and diff whitespace | Not separately timed | Passed |
| Frontend production build and news generation | Vite client build about four seconds | Passed, including TypeScript and prerender |

The targeted commands are available as `make test-research-network` and
`make test-research-network-db`. Full-system acceptance, container deployment and
production release were not run.

## Failures, repairs and retained coverage

Git history for prior content additions (#205, #212, #284), the standard-rules
suite, and the local Test Czar record in `docs/runbooks/test-performance-audit.md`
were inspected. No separate owner ledger was available.

- The first browser preparation failed before tests because this checkout lacked
  npm dependencies. Installed them; subsequent preparation succeeded.
- Early Rust compilation caught a misplaced content patch in the Bomber helper;
  two overlapping compile invocations reported that same error. Moved the patch
  into standard content assembly. An early formatting invocation also preceded
  creation of the new test module. No tests executed in those attempts.
- The first frontend build rejected a link-valued `DetailRow` label. Generalized
  that shared presentation prop from string to ReactNode; the build, lint and
  browser checks passed.
- Two historical content-upgrade tests failed in the first engine run. A fixture
  edit had accidentally removed IRN from the Plasma fixture instead of the
  Hyperspace fixture. Moving it repaired Plasma. Hyperspace then failed again in
  its custom-disable branch: it disabled Hyperspace Technology while leaving its
  newly enabled IRN dependent active, making the rules invalid before the expected
  conflict assertion. Removed
  `hyperspace_upgrade_initializes_technology_and_drive_and_preserves_customizations`
  under the repository's one-repair rule. It was not renamed or reintroduced.
  Retained protection includes the fresh/partial-release convergence unit test,
  generic disabled/custom-content conflict unit tests, deterministic Hyperspace
  prerequisite/payment/completion tests, and the full PostgreSQL Hyperspace and
  standard activation tests. The new IRN upgrade test covers the new research's
  own costs/gates/disabled conflicts and idempotence.
- Audited other Hyperspace disable/removal fixtures. The PostgreSQL Hyperspace
  disable case now also disables IRN; all 40 rules-upgrade tests pass. Standalone
  legacy Hyperspace formula fixtures do not install IRN and need no change.
- The first new navigation run passed both locked-state tests but its desktop and
  mobile active-operation scenarios waited for a quote after opening already
  active research. Interrupted that run (two interrupted tests). Inspection of
  `TechnologyInspector` showed that it deliberately suppresses that request.
  The repaired caller gates navigation on the preceding catalog response and
  asserts the previously delivered operation after opening its inspector. No
  sleeps, retries or timeout increases were added. Subsequent runs passed. The
  shared response helper and intentional negative tests were unchanged; this
  erroneous active-inspector waiter was confined to the new caller.
- An additional pure vector test initially failed to compile because persisted
  rules are immutable. After using a reconstructed rules artifact, its first
  runtime assertion exposed that the customized artifact had not been installed
  into the local test variable. Applied it before asserting the custom threshold;
  all six vectors passed on the single runtime repair. No production change was
  needed for this fixture correction.
- Optional screenshots initially captured a moving HUD/scroll position. Capture
  preparation now uses reduced motion, disables finite screenshot animations,
  scrolls to the top and dismisses transient event toasts through Escape. All
  capture-only preparation is conditional. Assertions run without screenshots.

## Visual review and cleanup

Inspected fresh running React screens at desktop 1440×900 and mobile 390×900:
network ready, active at origin, active from the remote colony, missing origin
lab prerequisite, and Research Lab technical details/unlock navigation. Desktop images are full-page captures; mobile images preserve the viewport to
avoid Chromium full-page compositor artifacts. The existing floating command HUD
remains visible. Screenshots stay local for delivery in the implementation chat;
none were uploaded or added to a PR.

Database validation used only Compose project `orbit-irn-cc61-test`. Docker's
default address pool was exhausted; an ephemeral Compose override supplied the
verified unused subnet `10.253.61.0/24`. Test databases were removed by the runner.
The project's PostgreSQL container, volume and network were removed with
`docker compose down --volumes` after validation. Other projects were untouched.
Frontend fixture servers/browser processes stopped with their runners.

Changed-file SHA-256: `14866adc42412c4b4dd724f0cd4a77c42a3a0ca7a2254ba58c87301436b1fbbf`.
