# Briefing celebration dismissal

Initially validated on `a357e49b08ca2c88abfda1a6b6682d0580ed2d81` plus the uncommitted
advisor, advisor browser test and tutorial README changes in this patch.

Before publishing, moved only these changes onto main
`ea180d7f038c2d6a8e7f96a8b724f356513efb3c`, excluding the unrelated announcement
arrow commit. Repeated the full advisor browser suite with screenshots disabled:
13 passed, 6.748 seconds preparation and 29.4 seconds Playwright execution.
Focused lint, formatting and diff checks passed again. The changed advisor code
and inspected screenshots are unchanged. Evidence: `/tmp/orbit-briefing-pr-validation`.

The celebration's orb click and Escape now clear its selected receipt IDs and
return the current visit to commands. This also suppresses a newly eligible
underlying lesson for that visit. The bubble's Command uplink button clears the
celebration too. New receipts still interrupt guidance, wait for an open uplink,
and appear after it closes. Existing lesson toggling remains unchanged.

## Coverage and results

- `npm run test:ui -- tutorial-advisor.spec.ts --workers=1`: 13 passed;
  application bundle preparation 4.601 seconds, Playwright execution 27.6 seconds.
  Desktop 1440×900 and mobile 390×900 screenshots were captured and inspected.
- `npm test -- apps/web/src/features/tutorial/advisor.test.ts`: 9 passed,
  490 milliseconds total.
- `npx tsc --noEmit -p apps/web`: passed.
- Focused ESLint, Prettier and `git diff --check`: passed.

The new application regression covers actual orb/CommandHud wiring, dismissal
with an eligible lesson underneath, keyboard reopening/focus, unchanged refresh,
new receipts while the uplink is open, Escape (desktop), and the celebration's
Command uplink button (mobile). The existing reward and next-directive navigation
test retains its assertions except the obsolete expectation that dismissal allows
the same congratulations to reopen.

## Failed attempts and repair record

1. Ran the new desktop regression against the original advisor implementation.
   It failed as expected: the orb's accessible name remained
   `Show briefing accomplishment` instead of `Open command HUD` after dismissal.
   Bundle preparation took 5.073 seconds; the failing case took 6.5 seconds.
   Evidence: `/tmp/orbit-briefing-regression-before`.
2. The first fixed-code run passed the dismissal assertion but stalled on a new
   test wait for a Tutorial response after an unchanged refresh. This refresh
   delivers overview without invalidating Tutorial. Stopped the task-owned runner
   with SIGTERM; this was incomplete validation, not a pass. Restored the original
   scenario's overview-response boundary. This is the new regression's one test
   repair; no timeouts or retries were added. Existing unchanged-refresh callers
   in this file already used the correct boundary. Bundle preparation took
   4.724 seconds; full interrupted elapsed time was not recorded.
3. The corrected full advisor suite passed on its first run. Evidence:
   `/tmp/orbit-briefing-dismissal-verified`.

Browser runs were serial with one worker. Runner allocation/wait and static-check
timings were not separately measured. These are local pre-PR measurements. The
runner cleaned up its preview server and temporary bundle after completion and
the interrupted run. No unrelated processes were stopped.
