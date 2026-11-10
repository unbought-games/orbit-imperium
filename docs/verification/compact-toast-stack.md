# Compact command notifications

Scope: owner-confirmed Discord triage #149. No reporter screenshots were
provided. The before/after images were captured locally using HTTP fixtures;
they are not images of the reporters' sessions.

## Behavior and visual review

The newest notice controls the stack height. At most two older cards peek out
behind it, within 12px of its top edge. Covered cards are inert, hidden from
assistive navigation and unable to intercept pointers. The top card retains its
full content, opening action, Escape dismissal and existing horizontal swipe.
Keyboard dismissal focuses the promoted card, or the orb when none remains.
The existing three-event history and seven-second expiry policy are unchanged.
Missing notice content is filtered before assigning depth.

Local browser evidence at 390x844 and 1440x900 reproduces the old vertical
obstruction and shows the compact stack, the last Galaxy target, and successive
promotion. Inspected every image. Captures stay in the implementation chat;
none were uploaded for the PR. The orb geometry is unchanged.

## Validation and test repair record

Base revision: `901cad85`. Validation covered this change's source diff; the PR's
checks verify the final committed head. Dependency setup took approximately six
seconds. Used Node 24.18.0 for checks and one browser worker on the shared machine
(initial load average 13.91). No database or Docker process was started.

- Before-change reproduction: two viewport cases passed, 2.642s module setup,
  5.8s browser run.
- First complete implementation check: both viewport cases passed all fourteen
  target launches, stack bounds, short drag, successive swipes, opening and
  final keyboard dismissal. 2.860s setup, 14.0s browser run.
- An initial fixture preparation attempt was interrupted because its paused
  clock prevented refresh scheduling. Used a fixed Date value with running
  timers instead. This attempt was not a passing validation.
- Extending the cases with an early keyboard dismissal initially failed in both
  widths (10.7s and 8.6s). The assertion incorrectly expected three visible
  cards immediately afterward; the unchanged three-event history still includes
  the dismissed event until it rolls off. Corrected the expected count to two
  for the next two launches, then three. Inspected Git history and the existing
  test-performance audit; the separate owner Test Czar ledger was unavailable.
- After that repair, desktop passed (8.8s). Mobile normal-motion touch input
  passed both successive swipes, but the final focus assertion failed (20.4s):
  the test tried to focus the underlying toast before the detail modal's 400ms
  exit had completed. **Removed the mobile variant outright** under the
  one-repair rule; did not retry it or replace it with another scenario.
  Combined setup/run: 5.844s / 33.2s. Its earlier screenshots and completed
  interaction assertions remain evidence, not a claim that this run passed.
- Retained the desktop browser regression for navigation, obstruction, pointer
  isolation, promotion and keyboard operation. Existing deterministic swipe
  thresholds and HUD model tests passed: 10 tests, 1.38s runner time.
- Full frontend lint, formatting and TypeScript checks passed. Individual phase
  timings were not recorded for that combined invocation.
- Existing live mobile notifications and spy-contact HUD browser cases both
  passed (4.7s / 2.4s), 3.686s module setup and 9.0s browser run.
- News compilation passed and retained both contributor acknowledgments.

The newly added variants were the only callers of their local swipe routine;
removing the mobile variant also removed its unused touch branch. Existing HUD
and playground tests retain separate live-notification, touch and motion
coverage. No timeouts were increased, assertions weakened or retries requested.
All local UI runner processes and their Vite servers exited or were explicitly
stopped; no shared processes were terminated. Merge/queue delay is not applicable:
this task is authorized to stop at human review.
