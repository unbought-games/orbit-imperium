# Shipyard lane handoff

Status: implementation complete on `emick/ship-appearance-yard` in the assigned
`ship-appearance-yard` checkout. No shared game-screens edits were made. Cherry-pick this lane commit
onto the integration branch after supplying the three shared modules below.

## Wiring contract

- `Progression` will branch to `ShipyardPage` only for `page === 'shipyard' &&
shipCustomizationEnabled`; the existing TechnologyPage branch remains unchanged
  when the flag is off. Existing EconomyScreen wiring can remain unchanged.
- Integrator must provide `client-model/ship-customization-enabled.ts` exporting
  boolean `shipCustomizationEnabled`, `shell/ship-appearances-context.tsx` exporting
  `useShipAppearances()` per IMPLEMENTATION.md, and
  `shell/ship-customization-launch-context.tsx` exporting
  `useShipCustomizationLaunch(): {open(target: string): void}`.
- Shipyard reuses TechnologyInspector / TechnologyDetails and their real quote,
  quantity, manufacturing order, feedback and technology tree flow. A render-layout
  seam changes presentation only. All ship links use existing selection.link,
  which already uses canonical routeTarget paths; no new route state or queries.
- FleetInventory mounts its appearance-reading child only behind the same flag.
  Snapshot binding must match the actual inventory view's complete owner binding
  before equipment is used. No appearance observations are inferred for opponents.
- An exported pure equipment-to-artwork helper handles both Shipyard and inventory.
  Existing usable artwork stays visible while another render is pending/failed;
  absent artwork falls back to resolveCatalogArt. Customize requires an installed,
  available skin for the selected target in the current binding's snapshot.

## Validation ownership

Integrator owns browser/build/full typecheck and before/after rendered inspection.
This lane will run cheap deterministic coverage and scoped formatting/lint only.
Required final capture states: selected Light Fighter desktop/mobile, ship rail
selection, quantity/build + queued result, unsupported ship without Customize,
loading/missing artwork fallback, existing artwork during pending/failed rerender,
Fleet inventory with equipped art, and production flag-off unchanged branch.

## Delivered files and behavior

- `features/shipyard/shipyard-page.tsx`: development Shipyard, persistent selection
  rail and real TechnologyInspector. The base Shipyard route shows the rail and
  a choose-a-craft prompt; selecting a ship navigates to its canonical item path.
  No implicit selection is stored or rendered under a mismatching URL.
- `shipyard-selection-rail.tsx`: military/civil groups, stationed quantities,
  locked/unavailable hints; ships remain inspectable when they cannot be built.
- `shipyard-detail-layout.tsx` and `shipyard.module.css`: selected artwork and
  Customize entry beside the existing ordering content; compact horizontal rail
  below 1100px and reduced artwork height below 768px. Mobile reads the decision
  before supporting artwork. Existing shared resource components own all costs.
- `ship-appearance-art.ts` / `ship-appearance-image.tsx`: complete binding check,
  available-skin predicate, equipment variant selection, prior usable output
  retention, catalog fallback and image-error fallback. No new persistence.
- `features/fleet-inventory.tsx`: gated context reader; fleet calculations, counts,
  table columns and canonical links are unchanged.
- Narrow shared edits: `features/progression.tsx`,
  `features/progression/technology-page.tsx`, `technology-details.tsx`,
  `detail-layout.tsx`. TechnologyInspector is exported and accepts optional
  `renderLayout(DetailLayoutProps): ReactNode`; TechnologyDetails passes unchanged
  order content and footer through it. The default is the original DetailLayout.

## Checks and failure record

Source revision: the commit containing this handoff (reported in chat at delivery).

- Focused run: `npm test -- src/features/shipyard/ship-appearance-art.test.ts
src/features/shipyard/shipyard-presentation.test.ts
src/features/progression/manufacturing-order.test.ts
src/features/progression/technology-details.test.ts
src/features/fleet-inventory-model.test.ts`.
- Initial run: 78 passed, 1 failed, 1.27s runner duration. The newly written rail
  test assumed progressionFixture populated its catalog; that fixture explicitly
  leaves it empty. No product or infrastructure failure. Searched test history and
  repair ledger (no existing entry/history); the one repair supplies two explicit
  typed entries. No assertion weakening, timeouts, waits or repeated retries.
- Affected run after repair: both new files, 17/17 passed in 351ms. Existing
  manufacturing/technology/inventory coverage passed in the initial run.
- Scoped ESLint, Prettier and `git diff --check` passed. No browser process,
  build, full typecheck, or expensive validation was launched. No processes need
  cleanup. Used the existing installed dependencies via a temporary local symlink;
  it is removed before handoff and is not committed.
- Final exact-commit check results are reported in chat. The integrator must run
  full typechecking with its shared modules, production flag-off validation and
  screenshots/interaction checks listed above. The static markup tests establish
  semantics only, not layout, focus, interactions, or server persistence.

No PR, merge or deployment was performed. Provider, launch behavior, route registry,
renderer and backend remain in their assigned lanes. No new game-screens seam or
registry change is required for the Shipyard branch.
