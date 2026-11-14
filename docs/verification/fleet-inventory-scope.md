# Fleets inventory scope — feedback 170 and 174

## Behavior and source of truth

Baseline `7d57e0532827fffe2bde0da65f03e8045b460dda` rendered the inventory
at the bottom of `MissionFleets`, below outgoing and incoming traffic. The
existing table used `unitCounts` for one origin and had no empire scope.
The baseline application fixture reproduced this: two flights pushed the
stationed inventory below the first desktop viewport.

The inventory now precedes traffic. A single table switches between Planet
(default) and Empire. Empire mode adds an existing-ship total and retains
stationed, flying and queued breakdowns. The selected body remains in the URL;
scope is local interaction state and survives switching bodies. Shipyard and
Dispatch actions retain that selected body. Traffic defaults to all owned and detected movements under Empire fleet traffic,
with ownership filters when other players are detected, independent of inventory scope. Mission detail
pages retain their existing presentation.

Counts derive from one confirmed store snapshot. Empire stationed counts sum
owned body inventories, including moons. Flying counts use `missions.fleets`
current ship manifests, including outbound, holding and returning phases, even
if the origin no longer appears among owned bodies. The server projection
`own_mission` excludes foreign and terminal fleets and emits each active owned
fleet once. Launch intent quantities, legacy mirror records, incoming contacts,
depot mirrors and pending launch overlays are not added to protocol 4 totals.
Queued counts sum remaining manufacturing quantities and never enter totals.
BigInt arithmetic preserves exact values. Legacy protocols preserve unknown
flying counts rather than inventing zero. No derived totals are stored.

Uses the shared ship comparator/grouping unchanged; no Galaxy layout changes.

## Validation

Tests run with Node 24.18.0, one browser worker, after checking competing
processes. Initial dependency installation took 3s; the host default Node 23
emitted engine warnings, so all validation uses the pinned Node 24 installation.

- Baseline application inventory journey: 1 passed; bundle 5.646s, browser 3.3s.
- Deterministic inventory model: 9 passed, 0.172s. Tests cover per-origin counts,
  all active phases, moon inventory, missing origins, surviving manifests rather
  than launch quantities, foreign contacts, values beyond safe JS integers,
  departure/return conservation, stationary ships, defenses and queued-only rows.
- Final application journey at 390×900 and 1280×900: 2 passed; bundle 5.108s,
  browser 7.7s. Covers inventory-before-traffic ordering, scope transitions,
  canonical planet/moon navigation, refresh, Shipyard links and mission details.
- Isolated inventory controls/layout: 6 passed; bundle 3.906s, browser 3.4s.
  Includes existing 320/390/1280 layout assertions plus keyboard focus, large
  empire totals, empty inventory and unavailable catalog at 320/1280.
- Application and component TypeScript checks passed. ESLint passed. Changed-file Prettier check passed after formatting the test.

Initial local runs had no failed behavior assertions, repair attempts, queue
removals or test deletions. Subsequent CI findings are recorded below.
Visual inspection prompted shorter explanatory copy and a tighter header;
application captures were refreshed after that change. A final reduced-motion
run produced settled-control captures; normal-motion journeys passed earlier. Optional screenshots
remain guarded by `ORBIT_TEST_SCREENSHOTS`. Screenshots are local chat artifacts,
not PR attachments. Fixture runners clean their temporary bundles, server and
port leases; no persistent task server remains.

The working changes above were tested on the baseline revision. PR CI establishes
the exact committed revision; its final result is reported in the implementation
chat. Full-system acceptance and production deployment are outside this scope.

## PR review and CI follow-through

First pushed revision `9624e1f7db1821f571740de589e9ead1de8dbd66`, CI run
`43492340580` attempt 1:

- Build/unit job `132116610126`: one deterministic assertion in
  `progression/options.test.ts` expected the old count object without `total`.
  Updated its exact expected result to include the satellite total; all other
  values and the legacy unknown-flight assertions remain. This was an omitted
  test adaptation, not an intermittent runner failure.
- Feature shard 2 job `132116610463`: density cases at 390/320 expected recall
  and arrival controls in the initial viewport. Feature shard 6 job
  `132116610286`: the phone shell case expected an incoming attack heading in
  the initial viewport. These three assertions encoded the superseded
  traffic-first layout. Git history and the repair ledger were checked; this is
  a deliberate requirement change, not a retry/stabilization repair.
  Updated density coverage verifies inventory/scope/Dispatch and a traffic shortcut
  in the first viewport, then uses that shortcut to expose recall and arrival data.
  The incoming case verifies a visible incoming count and one-click access to
  the attack above the navigation dock. Mission-detail viewport/recall coverage
  remains unchanged. No cases or assertions of still-required behavior removed.
- Review `PRRT_kwDOVRgPYs63QEul`: confirmed the missing-catalog empty-state defect.
  Restored the world empty check to authoritative body inventory and added
  missing-catalog-with-existing-ships component coverage at 390/1280. The empire
  empty state already requires an available catalog.

The compact header traffic shortcut targets incoming traffic when detected, otherwise
all traffic. Both targets retain selected-body URLs and account for the sticky
shell header. This preserves easy traffic access without moving inventory below
it again. The final screenshots include the updated shortcut.

The first local check of the new incoming shortcut exposed a product interaction:
TanStack hash navigation triggered the shell's page-heading focus and moved the
viewport back above the incoming section. Replaced the fragment navigation with
a local button that focuses and scrolls to the existing heading. This keeps
selected-body URL context intact and avoids changing shared shell routing. The
failing assertion was retained; this was a product defect, not a test repair.

Post-fix local results:

- Model/options unit tests: 47 passed (0.432s).
- Affected application cases: 6 passed (bundle 4.605s; browser 13.2s).
- Scope/error components: 4 passed (bundle 3.732s; browser 2.6s), supplementing
  the 4 existing inventory cases already passed above.
- Application/component type checks and ESLint passed again. A final typecheck
  briefly overlapped another package's browser check; it completed without a
  timeout or resource failure. No other task's processes were stopped.

No merge queue entry, merge or deployment was attempted.

## Owner header follow-up

Restored the visible `Fleets` title to match the sidebar. Right-aligned the
header controls with fleet slots immediately before Dispatch Fleet; kept the
slots and Dispatch together when the header wraps. Mission details use the same
action order. The existing application journey now asserts the visible title
and count/button geometry at 390/1280. All six affected application checks
passed on `cbaefdeb` plus these changes (bundle 4.755s; browser 13.1s), including
320px density, incoming access and mission detail actions. Fresh desktop/mobile
page and detail captures were inspected. Lint, formatting and diff checks passed.

Header follow-up CI at `8754f3ca` (run `43496705047`, attempt 1,
job `132134302841`) exposed two obsolete expectations in the tabbed-page density
case: it explicitly required zero visible Fleets headings at 390/1280. Updated
that exact expectation to one, preserving all route-focus, navigation and other
page-title assertions. This is the owner's requested behavior change, not a
flaky-test repair. History and the repair ledger were checked. Both affected
cases pass locally (bundle 4.668s; browser 10.5s); no production changes or
screenshot refresh were needed for this test-only correction.

## Owner shortcut removal

Removed the top Fleet traffic shortcut at the owner's request, including its
unused focus refs and scroll-target styling. The header now contains the Fleets
title and the right-aligned fleet count/Dispatch pair. Traffic remains below the
inventory. Existing tests now exercise ordinary scrolling to traffic instead of
the removed shortcut, retaining viewport/readability and mission detail checks.
Eight affected application cases pass on `a2178e19` plus these edits (bundle
5.110s; browser 25.1s), including title/route focus and 320px layout. Lint,
changed-source formatting and diff checks pass. Fresh 390/1280 captures of the
world and empire views were inspected, plus the 320px header. No failed checks
or test deletions in this follow-up.

## Owner annotated-page refinement

Implemented the eight browser comments:

- Removed the redundant inventory heading, selected-world subtitle and explanatory
  footer. The selected world remains in the shell and canonical URL; the inventory
  region keeps its accessible scope name. Moved Shipyard into the page header,
  immediately before fleet slots and Dispatch, with responsive wrapping.
- Added the existing catalog thumbnails to each ship name. The icon/name is one
  neutral-colored link with a shared focus outline and a quiet hover surface.
- Renamed the local Flying column to Away: owned ships launched from that body,
  including outbound, holding and returning missions. It excludes arrivals from
  other origins. Empire mode retains Flying across all owned origins. Queue
  tooltips preserve the confirmed/unbuilt/excluded-from-total distinction.
- Named the combined section Empire fleet traffic. Owned fleet/missile movements
  and detected incoming fleet/missile movements share a chronological list.
  All is the default. Detected traffic exposes an incoming-count badge and
  All/Yours/Others selection. Others means actual visible approaches; no foreign
  return intelligence is invented. Selected filters persist through refreshes,
  including loss of the last contact, so controls do not disappear under focus.
  Empty traffic gets one empty state, with distinct messages for filtered-empty
  views. Existing mission-detail and pending-launch behavior remains.

Coverage adaptations preserve the requested behavior: old incoming-region
selectors now target the combined traffic region or incoming articles; the
old separate empty message is replaced by assertions for one empty collection.
The component-only Shipyard link assertions move to the application header;
per-ship destination links remain covered at both boundaries. No test cases were
retired and no assertions about recall, missiles, cargo visibility, identities or
canonical navigation were weakened.

Validation on `046e6097` plus these edits:

- 16 deterministic inventory/movement/traffic model tests passed (0.172s).
- 8 isolated inventory cases passed (bundle 4.329s; browser 5.4s).
- 16 affected application cases passed (bundle 4.928s; browser 1.1m), including
  mixed-traffic filtering, keyboard focus after a delivered refresh, empty states,
  missile launches/details, recall, reconnect and player-name visibility.
- 7 additional cargo/navigation cases passed (bundle 6.010s; browser 20.3s).
- TypeScript and ESLint passed; focused formatting and diff checks passed.

Visual inspection found a shared actions class overriding local header layout;
removed that duplicate class and added a 390/1280 Shipyard/count geometry check.
Refreshed desktop/mobile screenshots after the layout fix. The in-app browser
also exercised the real local playground's filter with two transports and a
rival approach. Those preview-only fleets were added through the world CLI to
this checkout's isolated database. The preview and signed-in tab remain available.

The final header/scope/filter capture run passed all 7 focused cases (bundle
4.926s; browser 16.7s). Application and component TypeScript, ESLint, focused
formatting and diff checks passed again. All task fixture runners cleaned their
bundles and port leases; only the requested live playground remains running.

CI run `43512452938` attempt 1 at `7b092738` caught a real responsive-layout
regression in feature shard 3/job `132185982158`: Linux's wider system-font
metrics wrapped Shipyard above the fleet count at 390px. The downloaded failure
screenshot confirms the geometry assertion (Shipyard right edge 372 versus
fleet-slot left edge 113.59). Retained that assertion and switched both header
links to the shared small button variant, which keeps 44px targets while giving
the action row room across font metrics. Also gave icon/name links an 8rem
minimum so extreme exact counts scroll inside the table region rather than
crushing ship names into individual letters. This is a product repair, not a
flaky-test repair or timeout adjustment. Automated review reported no new issue.

Post-repair verification: 7 header/filter/application cases passed (bundle
5.650s; browser 18.3s), plus 5 exact-count/overflow component cases (bundle
4.340s; browser 3.8s). Lint, formatting and diff checks passed. Desktop/mobile
world, empire and traffic-filter captures were refreshed and inspected. No test
was deleted, relaxed or retried unchanged.

## Owner scope-label and tooltip follow-up

Shortened the scope controls to Planet and Empire. Removed the persistent
Confirmed counts paragraph in both scopes; Away and Flying now have a 16px
question-mark trigger using the shared InfoTooltip component. The explanations
retain the distinction between ships launched here and all empire missions, and
are available through hover, keyboard focus and touch with Escape dismissal.

On `1729ed0c` plus these changes, 10 component cases passed (bundle 4.297s;
browser 6.7s), including real touch and desktop hover/focus tooltip tests. Seven
affected application cases passed (bundle 4.831s; browser 17.2s). Lint, focused
formatting, component TypeScript and diff checks passed. Captured and inspected
fresh 390/1280 page views and both open tooltips. Screenshot-only tooltip
preparation is gated by ORBIT_TEST_SCREENSHOTS; behavior coverage is independent
of screenshots. No failed checks, test deletions or production data changes.

## Owner compact-header follow-up

Moved Planet/Empire next to the visible Fleets title using a named title-controls
slot on TaskHeader. Inventory scope is now one local selection in MissionFleets,
passed to the controlled inventory view; counts remain derived from the same
confirmed snapshot. Body switching preserves the selected scope. Existing
TaskHeader callers without title controls retain their previous structure.

The header Shipyard link is hidden below 640px. Dispatch Fleet becomes Dispatch
below 480px while retaining its full accessible name. The title and scope switch
stay together; action controls can wrap as a group on minimal widths. Mobile
Shipyard navigation remains covered through per-ship links; desktop retains the
header shortcut. Old mobile header-link assertions were replaced with intentional
visibility/label checks, not removed to mask a defect.

Validation on `b91a0152` plus these changes: 10 application cases passed (bundle
5.444s; browser 33.8s), including the owner's 511px viewport, 390/1280 scope/body
transitions and title/control geometry, and 320px density. Ten component cases
passed (bundle 4.524s; browser 7.6s), including exact totals, scope focus, empty
states and hover/touch help. Application/component TypeScript, lint, formatting
and diff checks passed. Fresh desktop, 511px, 390px and 320px captures were
inspected. No failed checks or test deletions in this follow-up.
