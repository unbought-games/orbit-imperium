# Light retrospective CI stability check — November 18, 2026

**Post-merge main CI is stable in the observed window:** 61 of 62 workflows
passed on their first attempt, and the latest 40 consecutive workflows passed.
Every sampled run has `run_attempt=1`; there are no successful reruns hiding
failed earlier attempts in these results.

This supports continuing the migration. It does not prove zero flakes, improved
coverage quality, or that migration alone caused the stability. These are whole
post-merge main workflows, not all PR/queue attempts or per-test failure rates.
Relevance selection can legitimately skip suites. Earlier failures before merge
remain in their PR and migration ledgers; this report does not erase them.

## Method and results

Read the latest 100 main push runs of the GitHub CI workflow, then selected the
62 created since phase one merged. The API page extends before the start of the
window, so it is not a truncated sample of that interval. No tests were rerun and
no automation was created. Raw compact records and exact milestone timestamps:
[2026-11-18-main-ci.json](reliability/2026-11-18-main-ci.json).

UTC window: first run created 2026-11-10 18:29:02 through latest sampled run
completed 2026-11-18 03:55:08. The latest completion is November 17 at 10:55 p.m.
America/New_York. Groups below include the migration's main run and subsequent
main pushes before the next listed migration, not overlapping cumulative totals.

| Landed milestone | Main CI passed / runs | Runs with reruns |
| --- | ---: | ---: |
| [Phase one — #385](https://github.com/unbought-games/orbit-imperium/pull/385) | 3 / 3 | 0 |
| [Resources/quotes — #387](https://github.com/unbought-games/orbit-imperium/pull/387) | 18 / 18 | 0 |
| [Catalog/progression — #406](https://github.com/unbought-games/orbit-imperium/pull/406) | 10 / 11 | 0 |
| [Dispatch/fleets — #417](https://github.com/unbought-games/orbit-imperium/pull/417) | 20 / 20 | 0 |
| [Empire/settings — #446](https://github.com/unbought-games/orbit-imperium/pull/446) | 1 / 1 | 0 |
| [Shell/navigation — #448](https://github.com/unbought-games/orbit-imperium/pull/448) | 6 / 6 | 0 |
| [Startup/HUD/tutorial — #456](https://github.com/unbought-games/orbit-imperium/pull/456) | 3 / 3 | 0 |

## The one failed workflow

[Run 43359549586](https://github.com/unbought-games/orbit-imperium/actions/runs/43359549586)
on catalog merge `7b2fa061` failed two broad-feature jobs: the HUD refresh-caption
case (job `131669658426`) and desktop moon-dialog case (job `131669658465`).
Native checks, the journey cohort and component cohort passed. This was not
classified as a GitHub outage merely because the original investigation included
outages. No unchanged rerun was used to turn this run green.

Streams 03 and 06 subsequently recorded the exact failure histories and retired
the affected browser sequences under repository policy, preserving separate
meaningful protection and making the lost browser-specific sequences explicit:
[Dispatch/fleets](../test-migration-dispatch-fleets.md) and
[startup/HUD/tutorial](../test-migration-startup-hud-tutorial.md).
Retirement is not proof that the old scenario was repaired. The underlying cause
of the combined held-HTTP/reduced-motion caption failure remained unconfirmed.

## Scope of the new guidance work

A separate chat is advancing skill examples, journey/ledger reconciliation and a
mandatory fresh-context adversarial test reviewer. Full feature-cohort removal,
broad performance work and explicit-acceptance consolidation remain separate.
Do not wait for those later tasks to apply the new authoring/review lessons once
validated and merged. This report is a point-in-time retrospective, not a promise
of unattended monitoring or a new scheduled validation job.
