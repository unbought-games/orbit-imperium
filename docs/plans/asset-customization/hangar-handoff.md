# Hangar lane handoff

## Delivered

`apps/web/src/features/ship-customization/ship-customizer.tsx` exports
`ShipCustomizer({target: string, onClose: () => void})`. Mount conditionally from
the gated shipyard launch seam. A target change starts a new draft session.
Base UI owns modality, keyboard dismissal and focus trapping. Close animates the
popup out before invoking `onClose`; the originating element receives focus if
still connected. Exit remains available during loading and saves. Unsaved edits trigger a nested
Base UI discard/keep-editing prompt; canceling it preserves the mounted hangar
and does not replay arrival animation. Names use the backend 40-character limit;
new UUIDs use the existing HTTP-compatible commandId helper.

The full-screen hangar fades in, the ship arrives from depth and the controls
slide in. Reduced motion removes all entry/exit animation. Mobile uses a compact
preview and a single scrolling column, including the footer and final actions.
The free drydock plate is copied from the authorized previous showroom study into
the feature directory; no private or supporter art is included.

Named primary/accent dyes come from the provider catalog. Locked/missing choices
remain recognizable and saved recipes are not rewritten to fallbacks. Current
server-resolved `snapshot.emblem` goes directly to preview on each observation;
recipes store only none/full/layers and near-wing/paired, never an emblem copy.
Saved designs can be chosen/equipped or copied; Save and equip creates the next
immutable revision. Standard appearance reset preserves the draft/library.
Queued/rendering/preparing/ready/failed/superseded/canceled statuses, prior artwork
retention explanation, retry/cancel and explicit refresh are implemented.

Local edits do not reset during polling/package loading. Save acknowledgments
advance only the submitted draft's revision token and preserve later edits. An
uncertain response retains that token so a later reload can acknowledge success.
The provider must preserve uncertain mutation request identity as agreed.

## Imports and contracts

- Provider: `../../shell/ship-appearances-context` -> `useShipAppearances()` per
  IMPLEMENTATION.md. No provider, routing or gate changes in this lane.
- Runtime: `../../../../../packages/ship-appearance/browser` ->
  `ShipAppearancePreview({skin,colors,emblem,treatment,placement,className,alt,onError})`.
  This matches runtime-handoff.md. Live compositing is real; fallback/load racing
  remains runtime-owned. Hangar displays preview failure and a retry button.
- Save `design.revision` is expected latest revision; new UUIDs use 0. Backend
  increments immutably. Equipment writes use latest observed equipment revision.
- Library rows support multiple revisions of a design (ID + revision key).
- Integration must keep the direct editor and provider behind
  `import.meta.env.DEV && import.meta.env.VITE_SHIP_CUSTOMIZATION === 'true'`.

## Validation

Only cheap focused validation was run; no browser, production build, or full
TypeScript checks, per the single validation owner rule.

- `npm test -- src/features/ship-customization/model.test.ts`: 11 tests passed.
  Initial 7-case run: 141 ms; expanded 9-case runs: 146/164 ms; final
  11-case run: 169 ms runner time. No failures.
- `eslint apps/web/src/features/ship-customization --max-warnings 0`: passed.
- Prettier applied to all feature TS/TSX/CSS; final check recorded in chat.
- Baseline: `3ac1a649`. Final committed revision recorded in the handoff chat.
- Dependencies temporarily linked from the existing installed workspace; no
  package/lock/config changes. No processes started or stopped.

The model tests protect pinned equipped revisions, authorized defaults, unsupported
packages/dyes, preserved unavailable selections, stale package revisions, name
validation, content comparison save acknowledgments preserving subsequent
edits, and unsaved-close protection. They do not prove browser focus, appearance, runtime compositing or backend
persistence.

## Integration-owner acceptance still required

No screenshots were captured: browser/build/full typechecking and final visual
review were explicitly assigned to the integrator. Capture and inspect final
running desktop and mobile screens before posting the one final PR.

One short fixture/application journey should cover:

1. Open from Shipyard; close with Escape during arrival, then reopen. Confirm
   focus returns to the opener and Tab stays inside the takeover. With unsaved
   edits, Escape opens discard/keep-editing; keeping edits must not replay entry. Repeat reduced
   motion and at 390px width; no horizontal overflow or obscured final actions.
2. Change primary dye (buttons named `Primary: <name>`), name, emblem treatment
   and placement. Deliver a polling snapshot/current-emblem update; edits and focus
   stay intact and preview uses the new resolved emblem.
3. Save and equip; deliver a next revision plus queued/rendering/preparing/ready
   observations. Confirm submitted values survive, revision advances, and previous
   artwork remains usable. Follow with an actual backend save/equip/reload exercise.
4. Exercise a failed render with retry/cancel flags, initial load failure/reload,
   preview asset failure/retry and unavailable dye/skin selections.
5. Verify production flag-off entry/fetch behavior in integrator-owned wiring.

No separate PR, merge or deployment was made.

## Isolated component follow-up

Added `apps/web/tests/components/ship-customization.scenarios.tsx` and
`ship-customization.component.spec.ts`. Integrator registry addition:

```ts
'ship-customization': async () =>
  (await import('./ship-customization.scenarios')).ShipCustomizationScenario,
```

The scene imports the integrated real `ShipAppearancesController` and exported
`ShipAppearancesContext` from the e1ab integration checkout's published seams.
It starts/stops the controller normally. Only the API port is controlled:
Load returns the prepared server observation; mutations wait for explicit
`window.shipCustomizationScene.accept(snapshot)`. `observe(snapshot)` travels
through controller.reload rather than directly modifying the Zustand store.
The scene never emulates draft, UI or controller transitions. No registry/config
or production changes were made in this follow-up.

Actual runtime package assets must be integrated under
`apps/web/public/art/ship-skins/orbit-light-fighter/concord-v1`. The preview is the
real compositor. Specs intercept exactly the hash-addressed compass and
forge-starwing media URLs and fulfill the actual freely bundled SVG bytes from
`crates/application/assets/insignias/`. Unexpected API calls remain subject to the
isolated fixture's blanket catcher. Each test stops the controller at teardown;
pending requests remove abort listeners when acknowledged.

Three narrowly scoped browser regressions:

- Desktop keyboard trap/wrap, nested dirty-close cancel preserving canvas mount,
  discard restoring the opener, and clean close under reduced motion.
- Dye/treatment/placement and current-emblem changes repaint real canvas pixels;
  each preceding render is observed before advancing. Emblem delivery uses a
  listener installed before the update and checks complete successful delivery.
  Name/selection/focus survive the observation. Held Save returns queued then
  rendering; another save submits the advanced revision while rendering continues,
  and explicit preparing/ready observations complete the flow.
- 390×844 reduced-motion layout has no dialog horizontal overflow, reachable Save
  and footer controls, and an onscreen discard dialog with restored opener focus.

Screenshot points (only active with `ORBIT_TEST_SCREENSHOTS=1`):
`hangar-discard-desktop-1280x900.png`,
`hangar-live-emblem-desktop-1280x900.png`,
`hangar-saved-desktop-1280x900.png`,
`hangar-preview-mobile-390x844.png`, and
`hangar-controls-mobile-390x844.png` in the test output directories. Screenshots
are evidence points, not readiness waits; compositor assertions run independently.

Follow-up checks: focused ESLint passed for both files; TypeScript
`transpileModule` syntax validation passed for both (not a typecheck); Prettier
check and whitespace validation passed. No browser/build/full tsc executed.
Integrator must register the scene, run `npm run test:components --
ship-customization.component.spec.ts`, inspect captures, and retain the separate
real backend persistence/authorization acceptance. These controlled API results
are not evidence of server persistence.
