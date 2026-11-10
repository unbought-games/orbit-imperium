# File audit index

Snapshot: `0c235fd6d27422374abf61ea44e39c015a9c1675`. All current browser specs are assigned exactly once.

The counts below are collected cases, not test executions. Source signals are lexical/AST observations, not findings by themselves. Read helper bodies when implementing a listed template; signals inside helpers are not attributed to each calling test.

Each owner brief contains the placement decision, concrete remaining work and protection to retain. The source links are pinned; full expanded cases and source hashes are in the inventory.

## 01 — Resources, quotes and production controls

[Workstream brief](workstreams/01-resources-and-quotes.md).

| File | Cases / journeys | Source observations |
| --- | ---: | --- |
| [apps/web/tests/building-quotes.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/building-quotes.spec.ts) | 42 / 0 | clock: 15, geometry: 17, gesture: 3, keyboard: 12, navigation: 12, response: 11, route: 1, submit: 15 |
| [apps/web/tests/catalog-affordability.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/catalog-affordability.spec.ts) | 2 / 0 | clock: 1, geometry: 1, navigation: 3, response: 3 |
| [apps/web/tests/locked-buildings.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/locked-buildings.spec.ts) | 7 / 0 | geometry: 2, gesture: 2, keyboard: 7, navigation: 5, response: 4, route: 1, submit: 6 |
| [apps/web/tests/progression-cancellation.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/progression-cancellation.spec.ts) | 5 / 0 | clock: 3, geometry: 1, keyboard: 5, navigation: 1, response: 1, route: 2, submit: 2 |
| [apps/web/tests/resources.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/resources.spec.ts) | 52 / 0 | clock: 6, geometry: 13, gesture: 16, keyboard: 35, navigation: 19, response: 16, route: 19, submit: 51 |

## 02 — Catalog, manufacturing and technical details

[Workstream brief](workstreams/02-catalog-and-progression.md).

| File | Cases / journeys | Source observations |
| --- | ---: | --- |
| [apps/web/tests/battlecruiser.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/battlecruiser.spec.ts) | 2 / 0 | geometry: 1, navigation: 2, response: 2, submit: 1 |
| [apps/web/tests/battleship.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/battleship.spec.ts) | 7 / 0 | navigation: 4, response: 4, route: 1, submit: 1 |
| [apps/web/tests/bomber.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/bomber.spec.ts) | 2 / 0 | geometry: 1, navigation: 2, response: 2 |
| [apps/web/tests/catalog-pages.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/catalog-pages.spec.ts) | 82 / 2 | clock: 5, geometry: 50, gesture: 14, keyboard: 53, navigation: 23, response: 19, route: 11, submit: 38 |
| [apps/web/tests/components/detail.component.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/components/detail.component.spec.ts) | 48 / 0 | clock: 3, geometry: 21, gesture: 3, keyboard: 16, navigation: 18, submit: 8 |
| [apps/web/tests/components/progression-comparison.component.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/components/progression-comparison.component.spec.ts) | 4 / 0 | geometry: 3, keyboard: 4, submit: 1 |
| [apps/web/tests/components/progression-detail.component.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/components/progression-detail.component.spec.ts) | 13 / 0 | geometry: 14, keyboard: 1, submit: 6 |
| [apps/web/tests/components/progression-forms.component.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/components/progression-forms.component.spec.ts) | 2 / 0 | geometry: 1, keyboard: 2, navigation: 1, submit: 1 |
| [apps/web/tests/cruiser.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/cruiser.spec.ts) | 1 / 0 | navigation: 1, response: 1, route: 1, submit: 2 |
| [apps/web/tests/destroyer.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/destroyer.spec.ts) | 2 / 0 | geometry: 1, navigation: 2, response: 2 |
| [apps/web/tests/fusion-reactor.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/fusion-reactor.spec.ts) | 2 / 0 | geometry: 1, keyboard: 2, navigation: 1, response: 1, route: 1, submit: 1 |
| [apps/web/tests/heavy-fighter.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/heavy-fighter.spec.ts) | 4 / 0 | clock: 3, geometry: 1, navigation: 3, response: 3, route: 1, submit: 2 |
| [apps/web/tests/hyperspace-drive.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/hyperspace-drive.spec.ts) | 4 / 0 | geometry: 2, navigation: 3, response: 3, route: 1, submit: 3 |
| [apps/web/tests/hyperspace-technology.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/hyperspace-technology.spec.ts) | 4 / 0 | geometry: 2, navigation: 3, response: 3, route: 1, submit: 4 |
| [apps/web/tests/industrial-buildings.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/industrial-buildings.spec.ts) | 4 / 0 | geometry: 1, navigation: 1, response: 1, route: 1, submit: 6 |
| [apps/web/tests/large-cargo.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/large-cargo.spec.ts) | 3 / 0 | navigation: 2, response: 2, route: 2, submit: 3 |
| [apps/web/tests/research-network.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/research-network.spec.ts) | 6 / 0 | geometry: 3, keyboard: 1, navigation: 3, response: 5, route: 1, submit: 5 |
| [apps/web/tests/solar-satellite.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/solar-satellite.spec.ts) | 6 / 0 | keyboard: 3, navigation: 8, response: 8, route: 2, submit: 2 |
| [apps/web/tests/terraformer.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/terraformer.spec.ts) | 2 / 0 | geometry: 1, navigation: 2, response: 2, route: 1, submit: 2 |

## 03 — Dispatch, Galaxy, fleets and mission controls

[Workstream brief](workstreams/03-dispatch-and-fleets.md).

| File | Cases / journeys | Source observations |
| --- | ---: | --- |
| [apps/web/tests/alliance-attacks.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/alliance-attacks.spec.ts) | 6 / 0 | clock: 3, navigation: 3, response: 3, route: 2 |
| [apps/web/tests/alliance-depot.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/alliance-depot.spec.ts) | 6 / 0 | clock: 3, geometry: 1, navigation: 4, response: 4, route: 3, submit: 4 |
| [apps/web/tests/arrival.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/arrival.spec.ts) | 2 / 0 | geometry: 2, gesture: 2, keyboard: 1, navigation: 1, response: 1, route: 2 |
| [apps/web/tests/colonization.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/colonization.spec.ts) | 5 / 0 | clock: 9, geometry: 2, navigation: 7, response: 7, route: 2, submit: 2 |
| [apps/web/tests/combat-simulation.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/combat-simulation.spec.ts) | 8 / 0 | geometry: 8, gesture: 1, keyboard: 6, navigation: 6, response: 9, route: 5, submit: 13 |
| [apps/web/tests/components/dispatch.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/components/dispatch.spec.ts) | 72 / 0 | clock: 9, geometry: 71, keyboard: 46, submit: 1 |
| [apps/web/tests/components/fleet-card.component.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/components/fleet-card.component.spec.ts) | 10 / 0 | geometry: 8, gesture: 7, keyboard: 6 |
| [apps/web/tests/components/galaxy-fleet.component.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/components/galaxy-fleet.component.spec.ts) | 9 / 0 | geometry: 8, keyboard: 11, submit: 3 |
| [apps/web/tests/components/galaxy-position.component.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/components/galaxy-position.component.spec.ts) | 8 / 0 | geometry: 7, keyboard: 10, submit: 4 |
| [apps/web/tests/dispatch-validation.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/dispatch-validation.spec.ts) | 12 / 2 | geometry: 15, keyboard: 1, response: 1, route: 4, submit: 10 |
| [apps/web/tests/fleet-inventory.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/fleet-inventory.spec.ts) | 1 / 0 | geometry: 3, navigation: 3, response: 3 |
| [apps/web/tests/galaxy-cards.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/galaxy-cards.spec.ts) | 50 / 3 | clock: 16, geometry: 40, gesture: 6, keyboard: 54, navigation: 12, response: 9, route: 7, submit: 29 |
| [apps/web/tests/missile-warfare.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/missile-warfare.spec.ts) | 5 / 0 | geometry: 5, keyboard: 6, navigation: 11, response: 11, submit: 23 |
| [apps/web/tests/mission-fleets.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/mission-fleets.spec.ts) | 9 / 0 | clock: 5, geometry: 17, gesture: 7, keyboard: 10, navigation: 4, response: 3, route: 1, submit: 1 |
| [apps/web/tests/moon-fleets.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/moon-fleets.spec.ts) | 10 / 0 | geometry: 2, keyboard: 7, navigation: 7, response: 7, route: 1 |
| [apps/web/tests/moons.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/moons.spec.ts) | 4 / 0 | geometry: 7, keyboard: 5, navigation: 7, response: 7, route: 1, submit: 2 |
| [apps/web/tests/sensor-phalanx.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/sensor-phalanx.spec.ts) | 2 / 1 | geometry: 1, navigation: 3, response: 5, route: 3, submit: 2 |

## 04 — Empire, lifecycle and settings

[Workstream brief](workstreams/04-empire-and-settings.md).

| File | Cases / journeys | Source observations |
| --- | ---: | --- |
| [apps/web/tests/active-work-summary.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/active-work-summary.spec.ts) | 11 / 0 | clock: 6, geometry: 7, keyboard: 2, navigation: 2, response: 2 |
| [apps/web/tests/components/tutorial-settings.component.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/components/tutorial-settings.component.spec.ts) | 13 / 0 | geometry: 11, keyboard: 13, submit: 5 |
| [apps/web/tests/empire-deletion.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/empire-deletion.spec.ts) | 2 / 1 | geometry: 1, keyboard: 1, navigation: 3, response: 3, route: 2, submit: 2 |
| [apps/web/tests/empire-history.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/empire-history.spec.ts) | 2 / 1 | navigation: 1 |
| [apps/web/tests/empire.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/empire.spec.ts) | 31 / 0 | clock: 13, geometry: 43, gesture: 3, keyboard: 12, navigation: 8, response: 5, route: 2, submit: 5 |
| [apps/web/tests/planet-abandonment.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/planet-abandonment.spec.ts) | 2 / 0 | clock: 1, geometry: 2, keyboard: 2, navigation: 4, response: 4, route: 3, submit: 2 |
| [apps/web/tests/planet-names.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/planet-names.spec.ts) | 5 / 0 | geometry: 18, gesture: 6, keyboard: 4, navigation: 2, response: 2, route: 3, submit: 4 |
| [apps/web/tests/vacation.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/vacation.spec.ts) | 3 / 1 | geometry: 1, keyboard: 3, navigation: 5, response: 5, route: 2, submit: 11 |

## 05 — Shell, navigation, public layout and primitives

[Workstream brief](workstreams/05-shell-and-navigation.md).

| File | Cases / journeys | Source observations |
| --- | ---: | --- |
| [apps/web/tests/components/action-sheet.component.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/components/action-sheet.component.spec.ts) | 12 / 0 | geometry: 10, gesture: 6, keyboard: 32 |
| [apps/web/tests/components/form.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/components/form.spec.ts) | 2 / 0 | keyboard: 6 |
| [apps/web/tests/components/loading.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/components/loading.spec.ts) | 2 / 0 | clock: 3, geometry: 6, keyboard: 2 |
| [apps/web/tests/components/popover.component.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/components/popover.component.spec.ts) | 1 / 0 | clock: 5, keyboard: 6 |
| [apps/web/tests/components/shell-controls.component.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/components/shell-controls.component.spec.ts) | 8 / 0 | geometry: 6, gesture: 6, keyboard: 14 |
| [apps/web/tests/components/shell-layout.component.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/components/shell-layout.component.spec.ts) | 11 / 0 | geometry: 55, keyboard: 6 |
| [apps/web/tests/components/shell-navigation.component.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/components/shell-navigation.component.spec.ts) | 11 / 0 | geometry: 12, keyboard: 4 |
| [apps/web/tests/components/shell-selection.component.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/components/shell-selection.component.spec.ts) | 5 / 0 | keyboard: 1 |
| [apps/web/tests/coordinate-links.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/coordinate-links.spec.ts) | 18 / 0 | geometry: 7, gesture: 3, keyboard: 13, navigation: 22, response: 18, route: 2 |
| [apps/web/tests/density.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/density.spec.ts) | 18 / 0 | clock: 6, geometry: 14, keyboard: 3, navigation: 9, response: 9, route: 2, submit: 1 |
| [apps/web/tests/desktop-navigation.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/desktop-navigation.spec.ts) | 10 / 2 | geometry: 11, gesture: 5, keyboard: 9, navigation: 3, response: 2 |
| [apps/web/tests/detail-playground.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/detail-playground.spec.ts) | 3 / 0 | clock: 3, navigation: 2, response: 2, submit: 1 |
| [apps/web/tests/home.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/home.spec.ts) | 12 / 1 | geometry: 9, navigation: 8, route: 3 |
| [apps/web/tests/loading-region.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/loading-region.spec.ts) | 1 / 1 | keyboard: 3, navigation: 1, response: 2, route: 1 |
| [apps/web/tests/mobile-selection.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/mobile-selection.spec.ts) | 9 / 0 | geometry: 3, keyboard: 4, navigation: 8, response: 4, route: 5 |
| [apps/web/tests/number-input.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/number-input.spec.ts) | 3 / 0 | keyboard: 7, navigation: 3, response: 3 |
| [apps/web/tests/planet-page-routing.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/planet-page-routing.spec.ts) | 15 / 4 | navigation: 10, response: 3, route: 2 |
| [apps/web/tests/shell.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/shell.spec.ts) | 59 / 3 | clock: 15, geometry: 66, gesture: 3, keyboard: 29, navigation: 44, response: 37, route: 16, submit: 11 |
| [apps/web/tests/web-app.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/web-app.spec.ts) | 6 / 1 | geometry: 3, gesture: 8 |

## 06 — Startup, authentication, recovery, HUD and tutorial

[Workstream brief](workstreams/06-startup-hud-and-tutorial.md).

| File | Cases / journeys | Source observations |
| --- | ---: | --- |
| [apps/web/tests/bootstrap-ui.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/bootstrap-ui.spec.ts) | 37 / 5 | clock: 13, geometry: 25, gesture: 1, keyboard: 16, navigation: 38, response: 3, route: 34, submit: 1 |
| [apps/web/tests/client-update.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/client-update.spec.ts) | 9 / 0 | clock: 3, geometry: 3, keyboard: 2, navigation: 5, response: 16, route: 5, submit: 2 |
| [apps/web/tests/command-hud.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/command-hud.spec.ts) | 37 / 1 | clock: 45, geometry: 44, gesture: 20, keyboard: 29, navigation: 30, response: 30, route: 7, submit: 5 |
| [apps/web/tests/components/hud-toasts.component.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/components/hud-toasts.component.spec.ts) | 5 / 0 | geometry: 3, gesture: 1, keyboard: 14, submit: 1 |
| [apps/web/tests/content-updates.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/content-updates.spec.ts) | 4 / 0 | navigation: 6, response: 5 |
| [apps/web/tests/hosted-auth.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/hosted-auth.spec.ts) | 12 / 2 | geometry: 2, navigation: 6, route: 1 |
| [apps/web/tests/hud-playground.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/hud-playground.spec.ts) | 5 / 0 | clock: 4, geometry: 13, gesture: 22, keyboard: 2, navigation: 5, submit: 8 |
| [apps/web/tests/release-announcement.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/release-announcement.spec.ts) | 5 / 0 | geometry: 1, keyboard: 6, navigation: 2, response: 6, route: 2 |
| [apps/web/tests/tutorial-advisor.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/tutorial-advisor.spec.ts) | 11 / 0 | geometry: 8, keyboard: 8, navigation: 12, response: 22, submit: 7 |
| [apps/web/tests/tutorial.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/tutorial.spec.ts) | 19 / 2 | geometry: 13, gesture: 2, keyboard: 9, navigation: 28, response: 38, submit: 11 |

## 07 — Social, alliances, recruitment and identity

[Workstream brief](workstreams/07-social-and-identity.md).

| File | Cases / journeys | Source observations |
| --- | ---: | --- |
| [apps/web/tests/alliance-identity.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/alliance-identity.spec.ts) | 3 / 0 | navigation: 3, response: 3, route: 4 |
| [apps/web/tests/alliances.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/alliances.spec.ts) | 11 / 2 | clock: 6, geometry: 5, keyboard: 9, navigation: 13, response: 23, route: 8, submit: 17 |
| [apps/web/tests/components/alliance.component.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/components/alliance.component.spec.ts) | 11 / 0 | geometry: 3, keyboard: 4, route: 1, submit: 16 |
| [apps/web/tests/components/identity.component.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/components/identity.component.spec.ts) | 3 / 0 | geometry: 2, keyboard: 4, navigation: 1 |
| [apps/web/tests/components/profile-display.component.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/components/profile-display.component.spec.ts) | 2 / 0 | geometry: 1, keyboard: 2 |
| [apps/web/tests/components/recruitment.component.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/components/recruitment.component.spec.ts) | 3 / 0 | geometry: 4, keyboard: 7 |
| [apps/web/tests/components/social.component.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/components/social.component.spec.ts) | 9 / 0 | geometry: 18, keyboard: 25, submit: 15 |
| [apps/web/tests/empire-identity.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/empire-identity.spec.ts) | 3 / 1 | clock: 1, keyboard: 2, navigation: 3, response: 2, route: 2 |
| [apps/web/tests/high-scores.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/high-scores.spec.ts) | 7 / 0 | geometry: 6, keyboard: 13, navigation: 8, response: 6, route: 8 |
| [apps/web/tests/insignias.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/insignias.spec.ts) | 13 / 0 | geometry: 17, gesture: 1, keyboard: 6, navigation: 17, response: 17 |
| [apps/web/tests/player-profiles.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/player-profiles.spec.ts) | 2 / 0 | geometry: 6, keyboard: 3, navigation: 2, response: 2, route: 3 |
| [apps/web/tests/recruitment.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/recruitment.spec.ts) | 2 / 0 | geometry: 1, navigation: 1, response: 1 |
| [apps/web/tests/social.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/social.spec.ts) | 8 / 1 | clock: 11, geometry: 4, keyboard: 3, navigation: 8, response: 9, submit: 5 |

## 08 — Reports, sharing, deletion and history

[Workstream brief](workstreams/08-reports-and-cleanup.md).

| File | Cases / journeys | Source observations |
| --- | ---: | --- |
| [apps/web/tests/combat-reports.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/combat-reports.spec.ts) | 4 / 0 | clock: 1, geometry: 4, gesture: 3, keyboard: 7, navigation: 2, response: 2, route: 2, submit: 7 |
| [apps/web/tests/components/delivered-report.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/components/delivered-report.spec.ts) | 2 / 0 | geometry: 1, navigation: 1 |
| [apps/web/tests/components/harvest-report.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/components/harvest-report.spec.ts) | 1 / 0 | geometry: 3, navigation: 1 |
| [apps/web/tests/components/report-cleanup.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/components/report-cleanup.spec.ts) | 2 / 0 | navigation: 1, submit: 2 |
| [apps/web/tests/components/shared-combat-report.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/components/shared-combat-report.spec.ts) | 2 / 0 | geometry: 1, navigation: 1 |
| [apps/web/tests/espionage-reports.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/espionage-reports.spec.ts) | 2 / 0 | clock: 1, geometry: 32, gesture: 1, navigation: 2, response: 2, route: 2 |
| [apps/web/tests/report-deletion.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/report-deletion.spec.ts) | 43 / 1 | clock: 18, geometry: 28, gesture: 14, keyboard: 18, navigation: 13, response: 12, route: 10, submit: 4 |
| [apps/web/tests/report-glance.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/report-glance.spec.ts) | 2 / 0 | clock: 1, geometry: 4, keyboard: 4, navigation: 1, response: 1, route: 1 |
| [apps/web/tests/report-sharing.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/report-sharing.spec.ts) | 8 / 1 | geometry: 4, keyboard: 5, navigation: 6, response: 5, route: 8, submit: 1 |

## 09 — Shared harness, contracts and explicit acceptance

[Workstream brief](workstreams/09-harness-and-acceptance.md).

| File | Cases / journeys | Source observations |
| --- | ---: | --- |
| [apps/web/tests/bootstrap.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/bootstrap.spec.ts) | 2 / 0 | navigation: 4, route: 2 |
| [apps/web/tests/construction.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/construction.spec.ts) | 1 / 0 | navigation: 1, submit: 2 |
| [apps/web/tests/homepage-built.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/homepage-built.spec.ts) | 10 / 0 | geometry: 1, keyboard: 7, navigation: 1, route: 5 |
| [apps/web/tests/login.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/login.spec.ts) | 1 / 0 | keyboard: 3, navigation: 1 |
| [apps/web/tests/missions.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/missions.spec.ts) | 2 / 0 | geometry: 1, keyboard: 4, navigation: 6, route: 4, submit: 3 |
| [apps/web/tests/mvp.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/mvp.spec.ts) | 1 / 0 | geometry: 1, navigation: 2, submit: 1 |
| [apps/web/tests/progression.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/progression.spec.ts) | 1 / 0 | geometry: 1, navigation: 4, response: 2, route: 3, submit: 5 |
| [apps/web/tests/raiding.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/raiding.spec.ts) | 2 / 0 | geometry: 2, keyboard: 3, navigation: 13, route: 4, submit: 5 |
| [apps/web/tests/reconnect.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/reconnect.spec.ts) | 4 / 0 | navigation: 5, route: 6, submit: 5 |
| [apps/web/tests/responsive.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/responsive.spec.ts) | 3 / 0 | geometry: 8, keyboard: 34, navigation: 7, response: 1, route: 2, sleep: 2, submit: 5 |
| [apps/web/tests/routing.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/routing.spec.ts) | 2 / 0 | keyboard: 3, navigation: 7, submit: 2 |
| [apps/web/tests/signup.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/signup.spec.ts) | 1 / 0 | navigation: 2, route: 1, submit: 2 |
| [apps/web/tests/transport.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/transport.spec.ts) | 1 / 0 | navigation: 1, submit: 2 |
| [apps/web/tests/zfoundation.spec.ts](https://github.com/unbought-games/orbit-imperium/blob/0c235fd6d27422374abf61ea44e39c015a9c1675/apps/web/tests/zfoundation.spec.ts) | 1 / 0 | keyboard: 7, navigation: 6, route: 3, submit: 4 |

## 10 — Final journey gate, CI cutover and agent guidance

[Workstream brief](workstreams/10-cutover-and-reliability.md).

| File | Cases / journeys | Source observations |
| --- | ---: | --- |

