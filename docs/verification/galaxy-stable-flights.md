# Galaxy traffic stability — feedback 173

Base: `7d57e0532827fffe2bde0da65f03e8045b460dda` (current main at start).
Implementation branch: `emick/galaxy-stable-flights`.

## Reproduction and cause

The previous `GalaxyFlightSummary` returned null for zero flights, then added
an in-flow line under the player identity. Its multiple-flight native details
also expanded in flow. A real `GalaxyPosition` scene with long labels moved the
Spy button 21px vertically at 390px, and 6.296875px at 1280px after one flight.

The redesign uses the existing first grid column: the idle planet/empty-orbit
marker becomes a fleet count, direction/pending icon and compact next arrival.
The same 44px interactive footprint remains throughout the lifecycle. It does
not add a status row, hide the action bar, or truncate the identity to fit fleet
text. A shared portaled Popover holds every mission, phase, exact countdown and
absolute arrival time. It supports hover, keyboard, touch, Escape and outside
click, and stays open while its collection changes. Long collections scroll.
Returning fleets still move to their origin row using the existing selector.

## Coverage and local evidence

- Pure arrival/count presentation and existing game projection: 65 tests passed
  in 272ms. Covers pending and confirmed deduplication, outbound/return target
  selection, earliest arrival, elapsed times, large counts and absent clock.
- Component run: 17 existing cases passed. The three new geometry variants
  initially failed (details below). Final focused run: four cases passed,
  4.379s bundle preparation and 4.6s runner time. The final run also covers
  keyboard scrolling in a 400px-high viewport and an open disclosure becoming
  empty without losing its trigger.
- All three geometry cases (320, 390, 1280 by 844) assert exact unchanged bounds
  for every row, Spy and Actions through zero, one, repeated Spy, multiple,
  pending, countdown, returning and completed states. They cover long planet
  and player names, 44px traffic targets, visible details, exact time semantics,
  viewport containment, touch/hover, keyboard re-entry and dismissal.
- Existing flight-disclosure test now checks the portaled details remain open
  across count/countdown updates and Escape/Enter activation, replacing its
  obsolete native-details markup assertions.
- Existing application checks: five passed (4.349s preparation, 15.0s runner):
  one-click espionage journey, ticking countdown without reload/request, saved
  probe counts at 390/1280, and desktop Spy with. Existing phase assertions were
  moved into the details; compact row assertions cover the count/arrival.
- Navigation/shared-column checks: two passed (4.341s preparation, 3.2s
  runner), including arrow controls and typed-coordinate/history behavior.
- ESLint, Prettier, application TypeScript, component TypeScript, contract drift
  and browser transport boundary checks passed. Rust/full production build
  validation is left to required CI; no backend behavior was changed.
- Fresh full-screen application images and component states are retained locally
  in `test-results/` and displayed in the implementation chat, not uploaded.
  Baseline captures are in `test-results/galaxy-traffic/before-*`.

## Failure classification and repair record

Initial component run: 3.836s preparation, 28.5s runner; 17 passed, 3 failed.
At 320px the right-aligned popover exceeded the viewport by 20px: a product bug.
Switched the new consumer to bottom-start placement so shared floating collision
handling can shift horizontally. No assertions were removed.

The 390/1280 cases failed because programmatic `focus()` after pointer use and
Escape is not keyboard re-entry for Floating UI's focus-visible behavior. Their
single test repair uses pointer activation for that pointer phase, and actual
Tab then Escape/Enter for keyboard re-entry. Existing file history and repair
ledger had no prior repairs for these new cases. All three passed after these
changes. No timeouts, sleeps, retries or assertion weakening were added.

Shared-machine process checks preceded expensive work. Browser bundles and
suites ran with one worker, after competing suites ended. No other task's
processes were stopped. Local fixture runners clean up their own temporary
assets/server/browser; the task-owned development preview is stopped at handoff.
No production database, deployment or merge is part of this work.
