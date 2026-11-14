# Galaxy traffic stability — feedback 173

Base: `7d57e0532827fffe2bde0da65f03e8045b460dda` (current main at start).
Implementation branch: `emick/galaxy-stable-flights`.

## Reproduction and cause

The previous `GalaxyFlightSummary` returned null for zero flights, then added
an in-flow line under the player identity. Its multiple-flight native details
also expanded in flow. A real `GalaxyPosition` scene with long labels moved the
Spy button 21px vertically at 390px, and 6.296875px at 1280px after one flight.

The current implementation preserves planet artwork and orders each row as
Planet/identity, Moon, Debris, Fleets, flexible space, Actions. Fleet chips have
independent outbound/pending and returning counts plus the nearest arrival.
Full mission phases, exact countdowns and absolute arrival times remain in the
shared accessible disclosure. The existing selector still places returning
fleets at their home row; the mockup's sample data is not production behavior.

Names truncate through an explicit PlayerName/PlayerProfile presentation option;
full identity remains available in the profile. At widths below 360px the normal
row hides its standalone Spy control and keeps the Actions dropdown. That menu
contains quick Spy as well as Spy with…, with the same eligibility/pending checks.
Moon actions and phalanx scanning remain reachable. Planet artwork is never
replaced by traffic, and flight updates never add an in-flow status row.

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

## Review follow-up

CI passed for `cdbfee36d4977b71d18b4abb807406cd686e03b4` on its first run
(workflow `43492825371`, aggregate gate finished 19:38:35 UTC). Bugbot identified
a valid accessibility defect: Popover's stable accessible name replaced its
visible count/arrival text. Added an optional shared trigger description using
`aria-describedby`, with pure summaries for idle, each phase, mixed phases, full
counts above 99, and next arrival. Existing callers keep their previous names
and behavior. Screen readers can inspect traffic without opening every row.

The focused presentation tests passed (10 cases, 164ms), and all four affected
component cases passed again (4.6s runner), now asserting accessible descriptions
through the entire lifecycle. Captures were refreshed and inspected after this
change. The latest pushed revision must pass CI independently of the earlier run.

## Local implementation and playable handoff (November 13)

Working tree based on `5cefd8ed58055ee9588e07281d078d3240d62996`, intentionally
uncommitted and not pushed while the owner tries the actual game. Tracked source
and test patch SHA-256: `b00d09280511ab203ca56fc2ace3a9da18677b2df43d2f2587f1d51f32fd7060`.
The earlier PR validation above applies to its older presentation only.

- Current focused unit/projection validation: 67 passed, 224ms.
- Current component cohort: 12 passed, 4.247s preparation / 14.7s runner.
  Includes 320/390/1280 geometry, real moon/debris/flight order, full names in
  accessible identity, quick Spy through the tiny-screen menu, retained Spy with,
  returning/pending/completed states, exact times and disclosure scrolling.
- Application checks: one-click Spy, countdown updates and Spy with passed;
  shared-column/navigation geometry passed across eight widths after fixing
  two product defects (below). Final geometry preparation 4.776s, runner 2.2s.
- ESLint, Prettier, component and application TypeScript passed.
- Live full-stack sign-in and a real probe launch through the 320px Actions menu
  succeeded in the in-app browser. Screenshots cover live desktop/mobile Galaxy,
  moon details, traffic details and the narrow action menu. These are real local
  backend data, not the comparison mockups.

Failure evidence and disposition: changing list gutters initially inset row
borders by 6px; retained the full-width assertion and restored edge-to-edge cards
without changing the content gutters. The next geometry run caught an unintended
600–1100px action-label change; restored tablet action text and its space. Both
were product defects, so no tests were deleted. The expanded 320px component case
first failed because Base UI opens pointer-triggered menus on requestAnimationFrame
while its clock was paused. Source inspection and a targeted diagnostic confirmed
that path; its single test repair explicitly advances one frame (17ms) before
asserting the menu. Keyboard opening and live pointer opening also worked. No
execution deadline increases, retries for luck, or weakened assertions were used.

The worktree's full `make dev` stack uses its own Compose database. The first
startup hit Docker's exhausted automatic address pools; an ignored, task-local
Compose override allocated the unused `10.253.243.0/28` subnet. Existing stacks and
networks were untouched. Cold Rust build took 2m23s. The normal playground loader
created the world and documented user/password login. A scoped demonstration at
[1:50:9] adds an actual combat-created moon, three-resource debris, and two long
outbound probes; ships were replenished for interactive use. The local world editor
counts moons in its colony-capacity validation, so the demonstration guardian was
given Astrophysics before further edits; no unrelated engine change was made.

Browser test runners cleaned up their temporary bundles and browsers. The
full development stack and the signed-in browser remain running for owner review.
Logs are retained under `test-results/galaxy-live/validation/` and local screenshots
under `test-results/galaxy-live/`. No merge or deployment occurred.

## Direct object actions and uniform density follow-up

Owner feedback replaces the separate Actions control with menus on the planet
surface (image, name and surrounding area), moon artwork and debris field.
Player profiles, status controls and coordinate links remain independent native
interactive siblings above the planet menu target; there are no nested anchors
or buttons. Planet and moon dispatch handlers retain their own target kind.
Harvest still opens the established responsive quick form, with the debris menu
trigger retained as its anchor and focus destination.

Removed the redundant You badge and idle Clear text. All normal Galaxy position
articles measure 69px (including their separator) at desktop and mobile, covering
both occupied and empty rows. The identity column now uses shared intrinsic
sizing with a 13–28ch desktop bound instead of an unconditional 200px column.
Mobile uses the available width and truncation. The official account service
allows 3–30 ASCII letters/digits/underscores; native local signup permits up to
80 UTF-8 bytes. The interactive fixture uses the 30-character account name
`commander_andromeda_1234567890`, retaining its full profile accessible name.
The local world editor rejected the attempted extra demo account with a numeric
range error; no new account was added. This does not affect the controlled
long-name UI coverage or the existing playable world.

Validation on HEAD `5cefd8ed58055ee9588e07281d078d3240d62996` plus the local edits:
- 23 focused deterministic/static cases passed (705ms).
- 13 component cases passed first attempt (5.743s preparation, 18.9s runner):
  physical planet-image/title hit testing, independent profile hover, 320/1280
  planet-vs-moon dispatch callbacks, 30-character names, all-row equal heights,
  repeated spying, fleet transitions and the revised debris-menu/harvest flow.
- Four Galaxy application cases passed (5.488s preparation, 7.7s runner).
- Six retained moon/debris application cases passed (5.418s preparation, 15.0s
  runner), including real request intent target kinds and moon failure banners.
- Lint, formatting and both TypeScript projects passed.
- The in-app browser verified actual planet, moon and debris menus; Harvest
  opens its form, clicking the player identity opens its public profile, and
  all 15 live row heights remain 69px. Desktop/mobile captures were refreshed.

Existing assertions were updated for the requested affordance: moon information
is in its direct action menu rather than a hover popup with a second nested menu;
debris requires selecting Harvest from its action menu; the planet menu target
replaces the old far-right Actions text. Their target, eligibility, payload,
resource and focus assertions remain. The previously retired desktop lunar
journey was not restored. No failures, timeout changes or retries occurred in
these updated cohorts.

Tracked source/test diff SHA-256:
`0f09114cfb692286307dbf458e4406f56172b55ee91d0857b8cb85fba28857fb`.
The additional untracked `galaxy-object-actions.component.spec.ts` SHA-256 is
`e0ebce03893c0bfad12c7ec2f8bdbaae45eecaf3223c5b78ba38efac308e8647`.
The stack and signed-in tab remain running. All follow-up work remains local;
no commit, push, PR update, merge or deployment was made.

The final coordinate-link application case also passed (2.2s runner). Its first
run passed coordinate copying/navigation but expected Transport to receive the
first menu focus; the newly added quick Spy action correctly received it instead.
After checking file history and the repair ledger, the single stale-assertion
repair asserts Spy focus first, ArrowDown to Transport, then Escape restoring
focus to the planet trigger. Coordinate behavior and the no-nested-controls
assertion remain intact. First-run evidence is retained in
`test-results/galaxy-target-actions/validation/coordinate-first-attempt.log`.


## Follow-up: identity text crossing row separators

The user screenshot exposed a product defect missed by equal-row-height checks:
activity/inactivity tooltip controls forced 24px title and player lines, producing
a 66px identity stack inside a 56px planet target. Coordinates crossed the row
separator. The shared InfoTooltip now offers an explicit inline variant with an
expanded 24px hit area outside its line box. Galaxy opts into it and uses compact
line metrics. Default tooltip consumers are unchanged.

Validated at HEAD `5cefd8ed58055ee9588e07281d078d3240d62996` plus uncommitted
changes. Real desktop identity measured 48.8px after the fix. At 320px, all 15
rows remained 69px, occupied identity stacks measured 42.9–44.8px, and coordinates
ended at least 12.6px above row bottoms. Captured and inspected the live game at
1487×1313, 390×844, and 320×844, including moon menu and inactivity tooltip.
Images are local in `test-results/galaxy-row-containment/`. The playground remains
running and signed in; viewport override reset. Nothing committed or pushed.

The existing traffic fixture now includes recent activity and inactivity status,
which the earlier plain-name fixture omitted. Existing object-menu/profile and
stationary-traffic component cases passed (5 cases, 4.405s bundle preparation,
6.8s runner). Lint, formatting, component typecheck and diff whitespace check
passed. No external runner wait was measured.

An attempted new containment assertion incorrectly assumed the isolated fixture
rendered coordinates as a link. Two task-owned runs were stopped while awaiting
that nonexistent element (preparation 4.584s and 5.232s). One label correction did
not fix the missing navigation context. Per the one-repair rule, the defective
new assertion block was removed rather than patched again; existing interaction
cases remain intact. Containment is verified by live DOM measurements and visual
captures, not claimed as automated coverage. No suite timeouts were increased.


## Follow-up: spacing, empty traffic, selection and shared fleet counter

Added 6px of identity inset and corrected the tablet artwork track to match its
40px image. Empty fleet summaries now render nothing; the explicit fleet column
keeps the remaining controls stationary. Removed the visible selected-location
paragraph while retaining aria-current, keyboard focus and the existing 2px
outline, which does not participate in layout. Removed the Galaxy toolbar top
border. Galaxy now uses the same default FleetSlots component as Fleets, without
its former compact variant or overriding button layout. At 320px the toolbar
uses 2px gutters to retain six touch-sized controls on one line.

Tested HEAD `5cefd8ed58055ee9588e07281d078d3240d62996` plus these uncommitted
changes. Object-menu/profile tests passed (2); traffic transitions passed (3,
4.606s preparation / 4.9s runner); coordinate copy/navigation, aligned columns and
countdown passed (3, 5.405s / 5.4s); selected-location outline tests passed (3,
5.147s / 4.9s); final one-click espionage passed (1, 4.954s / 3.1s); shared fleet
counter toolbar layout/tooltip/focus passed at 320, 390 and 1280px (3, 5.254s /
6.0s). Lint, formatting, component typecheck and diff checks passed. No measured
external runner wait. Task test processes exited; the live playground remains up.

Failure dispositions: moving keyboard checks after pointer interaction exposed
an invalid programmatic-focus assumption in the changed traffic test (3 failures,
22.4s runner). History and the repair record were checked; using actual Tab from
the preceding debris control restored the intended keyboard contract on the one
repair. The selection checks exposed a real 18px coordinate target from the prior
compact styling (3 failures, 25.0s combined runner). Restored its 24px minimum;
the compact text stack still fits at 54.8px inside 56px. The new default FleetSlots
label made the old exact text assertion stale (1 failure, 8.0s combined runner);
updated all slot-count expectations to include the label without weakening counts.

Final screenshots inspected: `test-results/galaxy-row-cleanup/final-1280x900.jpg`
and `final-320x844.jpg`, with active and absent traffic, selected row, increased
name spacing, single header border and the shared fleet counter. Selected and
unselected rows remain 69px. Browser viewport override reset and signed-in Galaxy
left open. No commits, pushes or PR changes.


## Follow-up: compact moon diameter

Removed the redundant moon-name prefix and paragraph margins from the moon menu
details; the line now reads `Diameter: 8,774 km` for the live sample. Diameter
remains because the documented destruction rules use it. No gameplay change.
At the same HEAD plus uncommitted changes, the two object-menu/profile component
cases passed (4.627s preparation, 3.1s runner), with focused lint, formatting and
diff checks green. Inspected the running menu at desktop 1280×900 and mobile
390×844; capture provider returned cropped images (634×446 and 193×418) showing
the complete menu. Images: `test-results/galaxy-moon-compact/`. Viewport reset;
playground retained. No commit or PR update.


## PR publication validation

Final source/test diff against `5cefd8ed58055ee9588e07281d078d3240d62996`:
`892c67c6a6bd96f6180ce3ff75c308338cf22ced8c4330a8bbfe88e5dfcbd7a2` (tracked
files; the new object-actions component spec is included separately in the commit).
Kept moon information available even when no mission can be launched, covered by
a static accessible-trigger assertion. Exploratory mockup entrypoints stay local
and are excluded from the PR.

- Unit checks: 24 passed, 489ms total.
- Components: galaxy-fleet, galaxy-position, galaxy-traffic and object-actions;
  22 passed, 4.597s preparation and 21.1s runner.
- Application: all galaxy-cards, moons and moon-fleets cases; 60 passed,
  5.000s preparation and 1.9 minutes runner.
- All 19 coordinate-links cases passed in the initial combined run before it was
  stopped in the next file. Two combined runs were interrupted to replace stale
  outside-click/tap targets: planet text is now passive content above its native
  action trigger, so direct locator activation correctly waits rather than
  dispatching through it. Both tooltip cases now dismiss via the Galaxy input;
  their original hover, focus, touch, content and dismissal assertions remain.
  Audited all matching planet-text activations in application tests. The final
  affected-file run passed; these were test-target defects, not product failures.
- Updated the fleet disclosure case to assert removal when its final fleet
  completes; keyboard dismissal/reopening remains covered while fleets exist.
- `make _static` and application TypeScript passed, including formatting, lint,
  both TypeScript projects, contracts and browser boundaries. No runner wait was
  observed. All task test runners exited; the user-facing development stack stays
  running.

Visual review uses the final overview captures in `test-results/galaxy-row-cleanup/`
and the compact moon-menu captures in `test-results/galaxy-moon-compact/`, already
shown in the originating chat. Required remote CI/review and queue validation
follow the published revision; local results do not substitute for that gate.


## PR review and first CI repair

CI run `43546357494` at `fbd1e0ac28cbb071ba6d0752f5f50b1419f7d91d`
exposed a product layout defect: Linux font metrics wrapped the System label at
320px, making the toolbar 91.78px tall. The original 80px bound remains intact;
toolbar field labels now stay on one line. Artifact inspection confirmed the
wrapped word; this was not infrastructure or a timeout.

Validated and addressed both review findings: disabled quick Spy still permits
opening the planet menu, with the eligibility reason visible and the action
remaining disabled; full planet names appear and wrap in the menu. Component
coverage checks long-name disclosure and a completely blocked unnamed target at
320/1280px. A shared caller audit updated missile and colonization tests to use
keyboard activation of the planet menu rather than the old standalone button's
center (which can now correctly belong to an independent profile/coordinate).
Physical image/title activation remains covered by the object-actions component.

Repair validation: 5 components passed (4.252s preparation / 6.1s runner), 6
Galaxy application cases passed (4.922s / 9.2s), and all 7 missile/colonization
cases passed (5.022s / 33.5s). Lint, formatting and both TypeScript projects passed.
Fresh actual-game screenshots in `test-results/galaxy-review-fixes/` show blocked
mobile actions at 320×844 and named-planet menu at 1280×900. Viewport reset and the
playground retained. No deployments or protection changes.


## November 13, 2026: Galaxy truncation retires previously repaired moon tour

PR427 head `c2bb746cc095eec7bdeaba05eab70fce01f199f4`, CI run `43547568226`,
job `132302491680` failed both 1440/390 variants of `shows planet and moon
together and opens the creation notice and combat outcome`. In its inner 320px
viewport, the test compared the moon control at x140 with the un-clipped inline
text span ending at x145.828. Artifact `14095335744` shows the rendered player
name correctly ellipsized before the moon: this is a geometry assertion defect,
not a visible overlap or infrastructure failure.

The November 12 canonical-report-URL entry above records this scenario's one
previous repair in PR394. Per the one-repair rule, delete both expanded cases;
do not repair the locator in that broad application tour or recreate the tour.
Retained coverage: the existing object-actions component cases measure the visible
profile link against the moon control at 320/1280px and preserve 44px targets,
object menus, diameter and target kind. Traffic component cases retain ordering,
no overflow and stable geometry. Deterministic `report-observation.test.ts` covers
creation-notice diameter/coordinates/content without exposing body IDs;
`moon-creation-summary.test.ts` retains combat success/failure and lunar preview
semantics. Engine moon tests retain atomic creation, both bodies at one location
and report delivery. Remaining `moons.spec.ts` cases retain moon selection,
canonical facilities navigation and eligibility; coordinate-links and moon-fleets
retain report/coordinate routing. The retired notice-to-facilities click is not
recreated as another browser tour.

Validation: 31 deterministic cases passed (1.18s total), 5 component cases passed
(5.023s preparation / 7.3s runner), and both remaining moon application cases
passed (5.530s / 7.7s). Formatting, focused lint and component typecheck passed.
No production changes or screenshot refresh required for this test disposition.
