# Orbit Base ship builder handoff

Four free fixed-view hulls can be reviewed in the development Shipyard. Each
uses two named dyes and the current empire emblem. Start a ship-specific change
from its authoring directory. The runtime manifest beside its installed maps
records the master and guide hashes, reference swatches, slots and attribution.

| Ship | Authoring source | Installed revision | Next visual decision |
| --- | --- | --- | --- |
| Light Fighter | [Cannon pods](../../art/orbit-base/ships/v1/light-fighter-cannon-pods/brief.md) | [v1](../../apps/web/public/art/ship-skins/orbit-base-light-fighter/v1/manifest.json) | Existing baseline. Its landing gear and platform are Hangar presentation. Saved ship art contains the transparent hull. |
| Heavy Fighter | [Tandem cockpit](../../art/orbit-base/ships/v1/heavy-fighter-tandem/brief.md) | [v2](../../apps/web/public/art/ship-skins/orbit-base-heavy-fighter/v2/manifest.json) | The owner accepted the near-wing emblem one panel aft. This is the first new hull to take through individual merge review. |
| Cruiser | [Louvered shoulders](../../art/orbit-base/ships/v1/cruiser-vents/brief.md) | [v1](../../apps/web/public/art/ship-skins/orbit-base-cruiser/v1/manifest.json) | The vents and foredeck guns came from the design study. The final material drawing and shoulder slots are new review candidates. Check the far mark at phone size. |
| Battlecruiser | [Foredeck battery](../../art/orbit-base/ships/v1/battlecruiser-foredeck-battery/brief.md) | [v1](../../apps/web/public/art/ship-skins/orbit-base-battlecruiser/v1/manifest.json) | Review the shoulder emblems and painted turret shields against the protected laser optics. The swept-stern and earlier laser studies remain available for comparison. |

The source branch was `emick/orbit-base-ship-studies` at `46709a86`. This
checkout already contained the Light Fighter landing work from `c5481fb6`.
The collection commit `fd755438` retains the four ships' earlier studies and
the original Heavy Fighter v1 package. The active Heavy Fighter package is v2.

## Finish one hull

1. Use the installed **author-orbit-asset** skill and the
   [authoring guide](../operations/recolorable-asset-authoring.md). Review the
   master, material drawing, reference swatches, and slot quads together.
2. Run `npm run art:orbit-base -- <slug>` and
   `npm run art:orbit-base:proof -- <slug>`. The slugs are `light-fighter`,
   `heavy-fighter`, `cruiser`, and `battlecruiser`. Open the printed proof sheet
   and the adjacent native PNGs. Inspect each channel, protected details,
   96-pixel silhouettes and the edges on pale, dark and saturated paint.
3. Run `npm run test:ship-appearance`. Repeat the compilation and compare
   package bytes. For a new installed revision use a new directory and update
   the shared class/skin/revision registry. The local API, browser and renderer
   must agree on the same revision. Keep the registered class bound to the
   design when it is saved, equipped, retried or reset.
4. Run the explicit live check below after changing an installed package or its
   integration. Inspect that hull's saved Shipyard art and Hangar captures in both
   viewports. Record the accepted reference, revision and outstanding decisions
   in its brief. Apply the UI and test-design skills when changing those layers.

The shared equipment and registry support is the dependency for individual hull
PRs. A one-hull PR can take its chosen authoring directory, package and registry
entry plus the applicable proof checks. The other ships' studies can stay on the
integration branch until their turn.

## Real local verification

The existing explicit Make target starts a local API, renderer and browser,
uses a new database inside the specified Compose project, and cleans up its
processes and database. From the repository root with the locked dependencies
and Playwright Chromium installed, use an isolated Compose project:

```sh
(
  set -e
  export COMPOSE_PROJECT_NAME="orbit-ship-review-$(uuidgen | tr '[:upper:]' '[:lower:]')"
  export ORBIT_DB_PUBLISHED_PORT=0
  trap 'docker compose down --volumes' EXIT
  make db-up
  ORBIT_TEST_DB_PORT=$(docker compose port db 5432 | awk -F: '{print $NF}')
  export ORBIT_TEST_DB_PORT
  make test-ship-customization-live
)
```

On a host whose Docker default network pools are exhausted, use a local Compose
override with an unused explicit subnet for this project. The run prints its
unique output directory under `test-results/ship-customization/live/`. Each
successful run records its revision, timings, page errors and the four artifact
IDs in `verification.json`. Its PNGs cover 1440 × 1000 and 390 × 844.

The journey enters each hull through Shipyard, changes dyes, saves and equips,
checks the pinned recipe and samples the live canvas against the native saved
image. On a fresh page it checks the browser-selected responsive image URL
against the equipped artifact's variants. All four assignments coexist in one
empire. The Light Fighter also exercises restart recovery, a changed empire
emblem, private variants and fleet display. Separate PostgreSQL coverage checks
cross-class refusals, revision pinning, cancel/retry and independent reset.

## Integration check, 2026-11-27

The reviewed application and acceptance code at `4cdf537e` passed the live
journey with four distinct artwork IDs and zero page errors. Setup took 22.417 s
and the browser flow took 48.557 s. The desktop and mobile Shipyard and Hangar
captures were inspected for all four ships. Each active package rebuilt
byte-for-byte with the locked dependencies. The renderer suite passed 17 tests,
the three focused client files passed 35 tests, and the ship appearance database
suite passed eight tests.

Two verification defects were corrected during integration:

- The new database isolation case initially left a Light Fighter request queued.
  The following lease-recovery test claimed it. The new case now closes its jobs
  with the fixture's account-scoped cleanup. The complete serial binary passed.
- The first native pixel comparison sampled inside a fighter emblem and compared
  different canvas conversion paths. The Light Fighter showed a one-level RGB
  discrepancy at alpha 253. The repaired check uses material-mask-confirmed
  paint points outside the emblem quads and applies identical canvas conversion
  before strict equality. The save assertions also check the Light Fighter's exact
  recipe and the responsive URL Chromium actually selected. An independent
  browser-test review passed the corrected journey at `4cdf537e`.
