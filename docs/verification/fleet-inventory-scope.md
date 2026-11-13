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

No failed behavior assertions, repair attempts, queue removals or test deletions.
Visual inspection prompted shorter explanatory copy and a tighter header;
application captures were refreshed after that change. A final reduced-motion
run produced settled-control captures; normal-motion journeys passed earlier. Optional screenshots
remain guarded by `ORBIT_TEST_SCREENSHOTS`. Screenshots are local chat artifacts,
not PR attachments. Fixture runners clean their temporary bundles, server and
port leases; no persistent task server remains.

The working changes above were tested on the baseline revision. PR CI establishes
the exact committed revision; its final result is reported in the implementation
chat. Full-system acceptance and production deployment are outside this scope.
