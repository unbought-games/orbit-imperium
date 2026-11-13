# Fleets inventory scope — feedback 170 and 174

## Behavior and source of truth

Baseline `7d57e0532827fffe2bde0da65f03e8045b460dda` rendered the inventory
at the bottom of `MissionFleets`, below outgoing and incoming traffic. The
existing table used `unitCounts` for one origin and had no empire scope.
The baseline application fixture reproduced this: two flights pushed the
stationed inventory below the first desktop viewport.

The inventory now precedes traffic. A single table switches between This world
(default) and Entire empire. Empire mode adds an existing-ship total and retains
stationed, flying and queued breakdowns. The selected body remains in the URL;
scope is local interaction state and survives switching bodies. Shipyard and
Dispatch actions retain that selected body. All traffic remains visible and is
explicitly labeled Entire empire, regardless of inventory scope. Mission detail
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
