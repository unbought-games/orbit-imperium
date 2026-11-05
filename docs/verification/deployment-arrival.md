# Deployment arrival verification

Based on `e8a96d81b47a06e7d06e441ee9716fc4a5b46be3` (current main at
implementation start). Inspected all three supplied Discord screenshots before
editing. No open PR overlapped dispatch timing.

Deploy now uses the arrival from the existing server-duration flight schedule in
place of its duplicate total. The local date/time formatter is shared with return
times. No quote, launch, fuel, mission or schedule calculations changed.

## Validation

- Pinned Node 24.18.0 and npm 11.16.0 used for checks. Initial dependency install
  used the host default Node 23/npm 10 and reported engine warnings; installation
  completed, then all checks used the pinned runtime. Installation timing was
  unavailable after the chat interruption.
- Focused component/schedule unit tests: 16 passed, 0.390s. Covers midnight/year
  rollover, absent terms, round trips, conditional colonization and holding.
- Lint, source formatting, TypeScript, whitespace and news generation passed.
  Generated build notes retain both reporter names and links.
- First browser run: 5 passed, preparation 1.808s, runner 3.4m, one worker.
  Covers speed/ships, 320/390/1280px layout, planet/moon destinations, origin
  changes, pending terms, stale replies and failures. No fleet is launched.
- Initial captures showed the destination controls rather than the timing block.
  Capture-only preparation now scrolls the estimates into view and is completely
  inactive unless screenshots are enabled. Refreshed capture run: 4 passed,
  preparation 1.892s, runner 2.6m, one worker. No failed tests or retries.
- Inspected fresh arrival/empty screenshots at 320x950, 390x950 and 1280x950, plus
  pending/error states at 390x950 and 1280x950. Timing labels and values fit at all
  sizes. The pre-existing mobile HUD overlaps portions of the lower action/error
  area in some states; mobile navigation/HUD placement is owned by concurrent
  Discord #130 and is outside this timing change.

The sorted changed application/test paths and contents, NUL-separated, have
SHA-256 `b75aa8d1e84f69622588f45c01b17125d07689a2b73580fa74b43205e229ccb0`.

Local tests had no external runner queue. Browser/Vite processes closed and
ports were released by the fixture runner. No database, Docker or full-system
acceptance was needed. Shared-machine work used one browser worker. No merge,
queue enrollment or deployment is authorized; merge delay is not applicable.
PR-head CI and review results are recorded in the implementation chat.

## CI repair record

Initial head `217e25e3ba18b2975757afdaea098835eab5be9a`, run `42045121186`:
build/lint/unit checks and automated review passed. Browser shard 5 failed two
existing `Dispatch origin follows authoritative self identity` cases (390px and
1440px); 139 other shard cases passed. Its test execution took 14.2m. Shard 4
was still running when the corrected head superseded this run. Initial runner
wait was 4s for scope selection and 3s after scope selection for the main jobs.

The new setup response gate incorrectly waited for `/overview`. Initial game
data arrives in `/api/v1/bootstrap`; `/overview` is a later background refresh.
The API trace showed navigation completing promptly while the response gate
waited through 15-second background cycles. This delayed the test's held profile
response beyond its real 12-second functional timeout. An unchanged diagnostic
case passed in 48.0s, confirming intermittency rather than closing the defect.

Checked test history (`89096d8d`, #242), the response helper history (`3c4651a3`,
#314), and repository repair records; no separate Test Czar ledger was available.
The single repair changes the common setup predicate to the bootstrap response
that actually delivers the required state. It retains complete-delivery and UI
assertions and all intentional pending/error/profile gates. Audited all callers
of this setup and its two before-navigation overrides; the fix covers them all.
No production timeout, assertion or retry policy changed; no test was removed.

Repaired focused run: seven cases passed, preparation 1.760s, runner 23.7s, one
worker, including both previously failing identity cases. Captures were refreshed.
The full dispatch file is also checked in the implementation chat before handoff.
