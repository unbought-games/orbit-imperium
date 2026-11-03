# Lunar Base implementation

Implemented on top of `34c36a1e63198ee0dd7988f813bc0eca063f5cd1`. This increment enables only Lunar Base. Release and deployment are separate operations.

## Delivered scope

Only Lunar Base is newly enabled on moons. Level 1 costs 20,000 metal / 40,000 crystal / 20,000 deuterium, doubling per level. Construction uses the existing BuildingRedesign2011 timing, body-local resources, one construction slot, committed terms, field reservation, cancellation refund, and scheduler.

Moon field capacity derives from completed levels as `1 + 3 × LunarBase`; stored base fields remain one. Building levels occupy fields, so Base 1 uses one of four fields. Upgrades require and reserve a free existing field, and add capacity only at completion. Base demolition is prohibited. Diameter does not cap construction. Disabled catalogs do not remove completed capacity or invalidate accepted work.

Fresh standard rules and retained-world upgrades enable the definition and initialize level zero. The rules upgrader recognizes the released disabled lunar placeholder and preserves unrelated custom content. Other lunar construction/manufacturing, local research, phalanx, gates, destruction, and voluntary moon abandonment remain unavailable.

The existing building screens show cost, field benefit, active construction/cancellation, and technical data. Moon resource shortfalls request fleet delivery, rather than implying storage upgrades or passive production can fund the base. The moon dossier links to Facilities. No new API shape or database migration was needed.

## Validation

Final tested working-tree source digest is recorded below; it excludes this implementation record. Rust 1.99.0 was selected explicitly because the shell initially found Homebrew Rust 1.97.1. Local Node 24.14.0/npm 11.9.0 emitted the repository engine-version warning; the web checks completed successfully.

| Check | Result | Measured phases |
| --- | --- | --- |
| `make test-lunar-base`: engine and application, all targets | 560 passed | Build 24.12s; execution/runner 6.963s |
| Same target: client unit tests | 1,309 passed, 135 files | Runner total 4.31s |
| Same target: existing moon and Terraformer browser regressions | 6 passed | Module preparation 1.271s; browser runner 17.4s |
| `make test-lunar-base-db` | Passed | Final build 1.57s; database test 5.830s |
| Clippy, engine/application/storage, all targets with test support and warnings denied | Passed | Final check 1.04s |
| TypeScript, ESLint, Prettier, Rust formatting, contracts, boundaries, whitespace | Passed | Separate phase timings not captured |
| Production web build | Passed | See local build log; no total timing captured |

The database journey creates a moon under retained pre-Lunar-Base rules, performs the existing lunar fleet/holding checks, upgrades the rules, and verifies duplicate/competing start commands, local debit, unchanged parent state, cancellation refund, restart, projected fields and immutable genesis. Existing engine/application suites retain historical replay and authorization coverage.

Visual review used the running React application with HTTP fixtures at 1440×900 and 390×900. It covered Facilities, insufficient resources, first build, construction, cancellation review, completion/next level, technical data, the moon dossier, and the still-unavailable Resources/Research/Shipyard/Defense screens. Final captures are local `test-results/lunar-base-<state>-<width>x900.png`. These captures validate UI presentation and interaction; PostgreSQL checks separately validate authoritative persistence. No full-system acceptance, process-recovery, production-container or deployment validation was run.

## Failed attempts and repair record

- First engine run: 10 standard-rule tests failed because the root building-definition whitelist still excluded Lunar Base. Added the missing definition eligibility; retained all assertions. Subsequent standard-rule tests passed.
- Second engine run: two new lunar unit tests inherited the MVP fixture's fixed 10× speed despite asserting 1× values and attempting a 1× disabled-rules update. Their shared fixture now explicitly uses independent 1× rules without the MVP universe restriction, matching the existing Terraformer fixture pattern. Both passed on the repair run and final suite.
- New `lunar-base.spec.ts` desktop/mobile scenarios first failed on malformed blocker fixtures (lowercase resource and missing nullable fields). After correcting the schema, the scenarios waited for a new quote on a balance-only refresh. The client intentionally derives affordability without re-requesting terms. These two new scenarios were removed under the one-repair rule; they were not renamed or replaced in the automated suite. Lunar arithmetic, authorization, fields, cancellation/replay and content restrictions remain in engine/client/database coverage. The visual flow was exercised separately; command and overview responses were awaited before advancing, and ordinary navigation was response-gated. Existing moon and Terraformer browser scenarios remain and pass. The removed scenarios had no prior Git history; the separate owner Test Czar ledger was unavailable, consistent with the existing performance audit's note.
- Database preparation first failed from disk exhaustion during compilation. Cleared only this worktree's generated Cargo artifacts and rebuilt with `CARGO_PROFILE_DEV_DEBUG=0`, `CARGO_PROFILE_TEST_DEBUG=0`, `CARGO_INCREMENTAL=0`. Docker subsequently returned HTTP 500/refused the test database connection; restarted the failed Desktop engine, then brought up the same disposable project.
- The expanded database test then overflowed its async stack. Its history in #323 documents the same composition hazard for inline fleet stages. Moved rule activation into the boxed lunar stage, boxed the large rules-service futures, and isolated synchronous retained-rule construction. No assertion, stack size, timeout or production behavior changed. The affected test passed after this repair. Future additions to this journey should preserve its existing boxed stage boundaries; no independent follow-up work was identified.
- An initial screenshot helper waited for a visible button by an incorrect accessible name; inspection used the actual rendered detail pattern instead. Intermediate capture passes were not counted as tests. Final screenshot navigation waits for complete fixture delivery; resource-only updates do not wait for nonexistent quote requests.

Cleanup: the disposable Compose project `orbit-lunar-base` used port 55439. Its test database was removed by the runner; the project container/network/volume were removed after validation. Browser runners and the local preview server were stopped. Generated Cargo artifacts were cleared to restore disk space; source changes and screenshots remain. Merge/queue delay: not applicable; no PR or queue activity.

Source digest (sorted changed/new paths and contents, NUL-separated): `9de350fb02d169095cf3d3c141cae15936c2847b5939fd159675fe11c2c8334f`.
