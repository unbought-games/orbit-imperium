# Espionage missile disclosure — November 10, 2026

Validated the working-tree implementation on base revision
`16b0c823149d63c0571a28a804834be2d11e6504`. The SHA-256 of
`git diff HEAD -- apps/web/src crates` followed by the bytes of
`contracts/fixtures/espionage-missile-defenses.json` is
`9ed3e646d0ee72df5ada564f267d4d4cc14c2de4c99f6b517fb22283a946d631`.
Documentation edits are outside that tested-code fingerprint. This records the
implementation checkpoint before the separately requested PR follow-through;
no deployment was performed.

## Behavior and coverage

- Both stored missile types use the existing defense visibility score of three.
  The engine test resolves actual missions at twelve probe/research combinations,
  checks exact observed counts, checks the separate building threshold, and
  verifies missiles neither appear in fleet intelligence nor add detection risk.
- A shared fixture matches engine output and passes the browser's existing
  detailed-report and inbox-preview contracts. No schema migration is needed.
- Static rendering distinguishes known quantities from unknown defenses;
  inbox summaries count combat defenses and missiles separately, using exact
  integer arithmetic. Shared-report projection preserves disclosure.
- Simulator import retains ordinary defenses and excludes missile inventory.
  Existing ordinary-raid and detected-espionage checks continue to pass.

## Executed checks

| Check | Result | Measured phases |
| --- | --- | --- |
| `npm ci --no-audit --no-fund` | Installed 304 packages | Setup 3s |
| Existing `groups expanded` espionage browser case, before changes | Passed | Vite preparation 2.029s; test 7.6s; runner total 8.5s |
| Four focused client test files: content-contract, report-preview, report-observation, combat-simulation-model | 140 passed, one new fixture assertion failed | Runner total 0.912s |
| Corrected combat-simulation-model file | 22 passed | Runner total 0.156s; all 141 distinct focused client cases passed across these runs |
| `cargo test -p orbit-engine --test missions missiles:: -- --nocapture` | First run: 12 passed, one new fixture failed; repaired run: 13 passed | Initial compilation 15.99s, execution 0.16s; repair compilation 0.69s, execution 1.04s |
| `cargo test -p orbit-engine --test missions espionage` | 10 passed, including the new boundary case | Compilation 0.76s; execution 2.31s |
| `cargo test -p orbit-application --lib report_sharing::tests::` | 6 passed | Compilation 25.25s; execution under 0.01s |
| New missile browser cases, attempt 1 | Both viewport cases failed | Vite preparation 4.250s; cases 9.0s and 9.1s |
| New missile browser cases, attempt 2 | Both viewport cases failed; removed under the one-repair rule | Vite preparation 1.868s; cases 7.5s and 7.6s |
| `npx tsc --noEmit -p apps/web` | Passed | Not separately timed |
| ESLint and Prettier on changed client files | Passed | Not separately timed |
| `cargo fmt --all -- --check` and `git diff --check` | Passed | Not separately timed |
| `cargo clippy -p orbit-engine -p orbit-application --lib -- -D warnings` | Passed | Total 12.69s; short local build-lock wait not separately timed |

The first deterministic failures were fixture authoring errors: missing world
edit `op` and an expected string where simulator inputs use a number. Each was
repaired once. The removed browser cases and their two failures are documented
in the Test Czar ledger at `docs/runbooks/test-performance-audit.md`. Retained
failure artifacts are under `test-results/browser-ui/espionage-reports-missile--*`.
There were no external runner waits or merge delays; those phases did not run.

## Visual inspection and cleanup

A disposable capture-only Playwright session loaded the real Vite application
with HTTP fixtures and the engine-checked missile quantities. It used the
response-aware helpers for inbox, detail, and shared-report delivery. Inspected
the inbox, revealed defenses, unknown defenses, and public shared report at
1440×1000 and 390×1000 viewport sizes. Counts remain legible and correctly grouped
without horizontal overflow. This inspection is separate from automated
regression-test success; the removed browser cases did not pass.

Images are local chat artifacts named
`test-results/espionage-missiles-{inbox,detail,unknown,shared}-{1440,390}x1000.png`.
Public-report captures include the full page. No images were uploaded or hosted.

All test and capture browser/server processes exited. The capture-only script
and images remain in ignored `test-results/` for review. The dev server logged
two unrelated announcement-proxy connection refusals during capture; report
responses and rendering completed. No database or Docker resources were started.

## PR follow-through

PR #384 initially tested head `80635e55c0f3a47e7cf92f6215e9ae8a8a2ca256`.
CI run `42830073442`, attempt 1, failed browser job `129877598739` during
`make test-homepage-built`: the news builder rejected this change's build note
because its YAML frontmatter was missing. Browser assertions had not started.
Added the required note ID, title and date, then successfully ran `npm run build`
locally (client bundling 3.91s; prerender bundling 0.371s). This is a deterministic
build-content repair, not an unchanged-job retry or a browser-test repair.
The full `make _static` check also passed before the initial push.

Head `519dec7ccbacd9bfafc28339806a3dcac7d1a5f7` then passed native checks,
all databases, automated review and seven browser shards. Run `42831197283`
failed shard 8/8 on the two already-repaired normal-motion shell cases; its
146 other cases passed (10.5m runner). The aggregate gate failed because of that
browser result. Integrated main `b3aaae7c` to validate the interaction with its
intentional Briefing animation, removed those two exhausted cases, and retained
the reduced-motion cases plus a cheap sidebar stylesheet contract. The full
failure/repair history is in the Test Czar ledger.

After integration, both retained motion browser cases passed (1.992s preparation,
3.4s runner), 23 existing focused client cases passed (0.421s combined runner),
and the new stylesheet test passed after one import-fixture repair (0.145s
runner). `make _static` passed. Refreshed all eight report captures against the
integrated application; capture-only browsers and Vite exited normally. No
queue entry or queue removal had occurred at this point.
