# Catalog and content test migration

Base: `a119915ffaeb881a7f54d65542478f4788bd4210`. Scope: the 15 specs below.
Inventory obtained from Playwright `--list --reporter=json`, including every
expanded viewport, prerequisite and building variant: **100 original cases,
56 retained browser cases, 44 removed/consolidated cases**. This is a bounded
migration, not a claim that the repository-wide small merge gate is finished.
No CI selection, shared fixture, production code, existing deterministic test,
package/Make configuration or changelog changed here.

## Deterministic replacements

[`catalog-content-migration.test.ts`](../../apps/web/src/features/progression/catalog-content-migration.test.ts)
uses the real `technicalUnlocks`, `ProgressionBlockers`, `TechnicalData`,
`ShipStatistics`, `comparisonStats`, `manufacturingPreview`,
`progressionCommand`, `availableDispatchShips`, schema validator and HUD model.
It uses public rules definitions as inputs and independent fixed expected costs,
requirements, propulsion/combat numbers and ship identities. It does not claim
that fixture arithmetic proves server authorization or balance persistence.

For each of HeavyFighter, Cruiser, LargeCargo, Battleship, Battlecruiser, Bomber
and Destroyer, the six named cases are:

- `retains each prerequisite, its exact level and its visible blocker`
- `renders universe unavailability without leaking technical statistics`
- `keeps descriptive content and decodable canonical artwork`
- `renders base statistics and applies completed drive levels`
- `quotes two units at exact resource costs and keeps the selected item in the command`
- `keeps its exact inventory and accepts its selected fleet composition`

Additional exact cases:

- `renders the distinct siege and native hyperspace rapid-fire profiles`
- `HyperspaceDrive hides disabled technical content and unlocks`
- `HyperspaceTechnology hides disabled technical content and unlocks`
- `Heavy Fighter acceptance retains the quoted costs and green HUD result`

Existing focused coverage retained and validated: `ship-comparison-model.test.ts`
(`switches Bombers at Hyperspace Drive 8 and preserves unknown or retained profiles`),
`ship-statistics.test.ts` (stationary satellite semantics), `technical-data.test.ts`
(unlocks, disabled content and disclosure markup), `options.test.ts` (manufacturing
arithmetic, affordability, queue estimates), `action-feedback-model.test.ts`
(`uses the last submitted quantity, scoped to the item and body, including a later failed attempt`
and `distinguishes a committed order awaiting its snapshot from the next-order balance`),
`ship-selection.test.ts`, `building-availability.test.ts`, `destroyer.test.ts`,
`hyperspace-technology.test.ts`, and `research-network.test.ts`.

### Browser and artwork boundaries

Static rendering here checks labels/content only. Geometry, keyboard/touch,
navigation, dialogs, native disclosure interactions, actual submitted forms and
browser image `naturalWidth` assertions stay in their named retained scenarios.
Every removed ship artwork `src` assertion now checks its exact canonical URL
and decodes the actual 1200px bitmap with Sharp. This detects absent/corrupt
assets without bootstrapping the game. Optional screenshot-helper `decode()`
work was not an unconditional merge-gate assertion; native browser artwork
checks on the retained research journeys remain unchanged. No screenshot-only
preparation was made mandatory. Battleship's unconditional geometry assertions
remain, including locked, catalog, detail and confirmed-order states.

## Expanded scenario disposition

Names below include containing viewport suites where a title alone repeats.
A retained case keeps its original observable assertions; formatting and removed
unused fixture helpers do not change its behavior. The industrial lifecycle also
asserts the applied demolition state before teardown, as recorded below.

### battlecruiser.spec.ts

| Original expanded scenario                                           | Disposition        | Named protection / browser reason                                                                                                                                                                                                                                                                                                                       |
| -------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Battlecruiser exposes its missing Shipyard prerequisite              | Move + consolidate | `Battlecruiser catalog contract` → `retains each prerequisite, its exact level and its visible blocker`; Battleship locked form journeys retain disabled Build and browser geometry.                                                                                                                                                                    |
| Battlecruiser exposes its missing Hyperspace Technology prerequisite | Move + consolidate | `Battlecruiser catalog contract` → `retains each prerequisite, its exact level and its visible blocker`; Battleship locked form journeys retain disabled Build and browser geometry.                                                                                                                                                                    |
| Battlecruiser exposes its missing Hyperspace Drive prerequisite      | Move + consolidate | `Battlecruiser catalog contract` → `retains each prerequisite, its exact level and its visible blocker`; Battleship locked form journeys retain disabled Build and browser geometry.                                                                                                                                                                    |
| Battlecruiser exposes its missing Laser Technology prerequisite      | Move + consolidate | `Battlecruiser catalog contract` → `retains each prerequisite, its exact level and its visible blocker`; Battleship locked form journeys retain disabled Build and browser geometry.                                                                                                                                                                    |
| Battlecruiser stays unavailable before its universe enables it       | Move + consolidate | `Battlecruiser catalog contract` → `renders universe unavailability without leaking technical statistics`; Battleship unavailable form journey retains disabled Build.                                                                                                                                                                                  |
| Battlecruiser submits the selected build quantity at 390px           | Move + consolidate | `Battlecruiser catalog contract` → `quotes two units at exact resource costs and keeps the selected item in the command`, `keeps descriptive content and decodable canonical artwork`, `renders base statistics and applies completed drive levels`; rapid-fire test; Large Cargo/Battleship form journeys retain actual controls and confirmed result. |
| Battlecruiser submits the selected build quantity at 1440px          | Move + consolidate | `Battlecruiser catalog contract` → `quotes two units at exact resource costs and keeps the selected item in the command`, `keeps descriptive content and decodable canonical artwork`, `renders base statistics and applies completed drive levels`; rapid-fire test; Large Cargo/Battleship form journeys retain actual controls and confirmed result. |
| Battlecruisers can be selected, quoted and launched at 390px         | Move + consolidate | `Battlecruiser catalog contract` → `keeps its exact inventory and accepts its selected fleet composition`; Cruiser attack and Large Cargo transport journeys retain selected composition, quoted result and launch wiring.                                                                                                                              |
| Battlecruisers can be selected, quoted and launched at 1440px        | Move + consolidate | `Battlecruiser catalog contract` → `keeps its exact inventory and accepts its selected fleet composition`; Cruiser attack and Large Cargo transport journeys retain selected composition, quoted result and launch wiring.                                                                                                                              |
| Battlecruiser comparison and research unlocks at 390px               | Retain             | Comparison disclosure/checkbox wiring, visible selected column, responsive overflow; research unlock links where present.                                                                                                                                                                                                                               |
| Battlecruiser comparison and research unlocks at 1440px              | Retain             | Comparison disclosure/checkbox wiring, visible selected column, responsive overflow; research unlock links where present.                                                                                                                                                                                                                               |
| Battlecruiser locked detail at 390px                                 | Move + consolidate | `Battlecruiser catalog contract` → `retains each prerequisite, its exact level and its visible blocker`; Battleship locked form journeys retain disabled Build and browser geometry.                                                                                                                                                                    |
| Battlecruiser locked detail at 1440px                                | Move + consolidate | `Battlecruiser catalog contract` → `retains each prerequisite, its exact level and its visible blocker`; Battleship locked form journeys retain disabled Build and browser geometry.                                                                                                                                                                    |

### battleship.spec.ts

| Original expanded scenario                                             | Disposition        | Named protection / browser reason                                                                                                                                                                                       |
| ---------------------------------------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Battleship exposes its missing Shipyard prerequisite at 390px          | Retain             | Representative locked ship control/blocker wiring plus overflow at both widths and both prerequisite kinds.                                                                                                             |
| Battleship exposes its missing Hyperspace Drive prerequisite at 390px  | Retain             | Representative locked ship control/blocker wiring plus overflow at both widths and both prerequisite kinds.                                                                                                             |
| Battleship exposes its missing Shipyard prerequisite at 1440px         | Retain             | Representative locked ship control/blocker wiring plus overflow at both widths and both prerequisite kinds.                                                                                                             |
| Battleship exposes its missing Hyperspace Drive prerequisite at 1440px | Retain             | Representative locked ship control/blocker wiring plus overflow at both widths and both prerequisite kinds.                                                                                                             |
| Battleship stays unavailable before its universe enables it            | Retain             | Representative unavailable ship detail disables Build.                                                                                                                                                                  |
| Battleship submits the selected build quantity at 390px                | Retain             | Representative quantity form, cost controls, command/result wiring. Battleship also retains catalog/detail/result geometry and comparison interaction.                                                                  |
| Battleship submits the selected build quantity at 1440px               | Retain             | Representative quantity form, cost controls, command/result wiring. Battleship also retains catalog/detail/result geometry and comparison interaction.                                                                  |
| Battleships can be selected, quoted and launched at 390px              | Move + consolidate | `Battleship catalog contract` → `keeps its exact inventory and accepts its selected fleet composition`; Cruiser attack and Large Cargo transport journeys retain selected composition, quoted result and launch wiring. |
| Battleships can be selected, quoted and launched at 1440px             | Move + consolidate | `Battleship catalog contract` → `keeps its exact inventory and accepts its selected fleet composition`; Cruiser attack and Large Cargo transport journeys retain selected composition, quoted result and launch wiring. |

### bomber.spec.ts

| Original expanded scenario                                      | Disposition        | Named protection / browser reason                                                                                                                                                                                                                                                                                                                |
| --------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Bomber exposes its missing Shipyard prerequisite                | Move + consolidate | `Bomber catalog contract` → `retains each prerequisite, its exact level and its visible blocker`; Battleship locked form journeys retain disabled Build and browser geometry.                                                                                                                                                                    |
| Bomber exposes its missing Plasma Technology prerequisite       | Move + consolidate | `Bomber catalog contract` → `retains each prerequisite, its exact level and its visible blocker`; Battleship locked form journeys retain disabled Build and browser geometry.                                                                                                                                                                    |
| Bomber exposes its missing Impulse Drive prerequisite           | Move + consolidate | `Bomber catalog contract` → `retains each prerequisite, its exact level and its visible blocker`; Battleship locked form journeys retain disabled Build and browser geometry.                                                                                                                                                                    |
| Bomber stays unavailable before its universe enables it         | Move + consolidate | `Bomber catalog contract` → `renders universe unavailability without leaking technical statistics`; Battleship unavailable form journey retains disabled Build.                                                                                                                                                                                  |
| Bomber submits the selected build quantity at 390px             | Move + consolidate | `Bomber catalog contract` → `quotes two units at exact resource costs and keeps the selected item in the command`, `keeps descriptive content and decodable canonical artwork`, `renders base statistics and applies completed drive levels`; rapid-fire test; Large Cargo/Battleship form journeys retain actual controls and confirmed result. |
| Bomber submits the selected build quantity at 1440px            | Move + consolidate | `Bomber catalog contract` → `quotes two units at exact resource costs and keeps the selected item in the command`, `keeps descriptive content and decodable canonical artwork`, `renders base statistics and applies completed drive levels`; rapid-fire test; Large Cargo/Battleship form journeys retain actual controls and confirmed result. |
| Bombers can be selected, quoted and launched in an attack fleet | Move + consolidate | `Bomber catalog contract` → `keeps its exact inventory and accepts its selected fleet composition`; Cruiser attack and Large Cargo transport journeys retain selected composition, quoted result and launch wiring.                                                                                                                              |
| Bomber Hyperspace profile is explained and compared at 390px    | Retain             | Comparison disclosure/checkbox wiring, visible selected column, responsive overflow; research unlock links where present.                                                                                                                                                                                                                        |
| Bomber Hyperspace profile is explained and compared at 1440px   | Retain             | Comparison disclosure/checkbox wiring, visible selected column, responsive overflow; research unlock links where present.                                                                                                                                                                                                                        |

### cruiser.spec.ts

| Original expanded scenario                                       | Disposition        | Named protection / browser reason                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cruiser exposes its missing Shipyard prerequisite                | Move + consolidate | `Cruiser catalog contract` → `retains each prerequisite, its exact level and its visible blocker`; Battleship locked form journeys retain disabled Build and browser geometry.                                                                                                                                                                    |
| Cruiser exposes its missing Ion Technology prerequisite          | Move + consolidate | `Cruiser catalog contract` → `retains each prerequisite, its exact level and its visible blocker`; Battleship locked form journeys retain disabled Build and browser geometry.                                                                                                                                                                    |
| Cruiser exposes its missing Impulse Drive prerequisite           | Move + consolidate | `Cruiser catalog contract` → `retains each prerequisite, its exact level and its visible blocker`; Battleship locked form journeys retain disabled Build and browser geometry.                                                                                                                                                                    |
| Cruiser stays unavailable before its universe enables it         | Move + consolidate | `Cruiser catalog contract` → `renders universe unavailability without leaking technical statistics`; Battleship unavailable form journey retains disabled Build.                                                                                                                                                                                  |
| Cruiser submits the selected build quantity at 390px             | Move + consolidate | `Cruiser catalog contract` → `quotes two units at exact resource costs and keeps the selected item in the command`, `keeps descriptive content and decodable canonical artwork`, `renders base statistics and applies completed drive levels`; rapid-fire test; Large Cargo/Battleship form journeys retain actual controls and confirmed result. |
| Cruiser submits the selected build quantity at 1440px            | Move + consolidate | `Cruiser catalog contract` → `quotes two units at exact resource costs and keeps the selected item in the command`, `keeps descriptive content and decodable canonical artwork`, `renders base statistics and applies completed drive levels`; rapid-fire test; Large Cargo/Battleship form journeys retain actual controls and confirmed result. |
| Cruisers can be selected, quoted and launched in an attack fleet | Retain             | Representative attack (Cruiser) or transport (Large Cargo) selection, quote composition and launch command wiring.                                                                                                                                                                                                                                |

### destroyer.spec.ts

| Original expanded scenario                                              | Disposition        | Named protection / browser reason                                                                                                                                                                                                                                                                                                                   |
| ----------------------------------------------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Destroyer exposes its missing Shipyard prerequisite                     | Move + consolidate | `Destroyer catalog contract` → `retains each prerequisite, its exact level and its visible blocker`; Battleship locked form journeys retain disabled Build and browser geometry.                                                                                                                                                                    |
| Destroyer exposes its missing Hyperspace Technology prerequisite        | Move + consolidate | `Destroyer catalog contract` → `retains each prerequisite, its exact level and its visible blocker`; Battleship locked form journeys retain disabled Build and browser geometry.                                                                                                                                                                    |
| Destroyer exposes its missing Hyperspace Drive prerequisite             | Move + consolidate | `Destroyer catalog contract` → `retains each prerequisite, its exact level and its visible blocker`; Battleship locked form journeys retain disabled Build and browser geometry.                                                                                                                                                                    |
| Destroyer stays unavailable before its universe enables it              | Move + consolidate | `Destroyer catalog contract` → `renders universe unavailability without leaking technical statistics`; Battleship unavailable form journey retains disabled Build.                                                                                                                                                                                  |
| Destroyer submits the selected build quantity at 390px                  | Move + consolidate | `Destroyer catalog contract` → `quotes two units at exact resource costs and keeps the selected item in the command`, `keeps descriptive content and decodable canonical artwork`, `renders base statistics and applies completed drive levels`; rapid-fire test; Large Cargo/Battleship form journeys retain actual controls and confirmed result. |
| Destroyer submits the selected build quantity at 1440px                 | Move + consolidate | `Destroyer catalog contract` → `quotes two units at exact resource costs and keeps the selected item in the command`, `keeps descriptive content and decodable canonical artwork`, `renders base statistics and applies completed drive levels`; rapid-fire test; Large Cargo/Battleship form journeys retain actual controls and confirmed result. |
| Destroyers can be selected, quoted and launched at 390px                | Move + consolidate | `Destroyer catalog contract` → `keeps its exact inventory and accepts its selected fleet composition`; Cruiser attack and Large Cargo transport journeys retain selected composition, quoted result and launch wiring.                                                                                                                              |
| Destroyers can be selected, quoted and launched at 1440px               | Move + consolidate | `Destroyer catalog contract` → `keeps its exact inventory and accepts its selected fleet composition`; Cruiser attack and Large Cargo transport journeys retain selected composition, quoted result and launch wiring.                                                                                                                              |
| Destroyer native Hyperspace profile is explained and compared at 390px  | Retain             | Comparison disclosure/checkbox wiring, visible selected column, responsive overflow; research unlock links where present.                                                                                                                                                                                                                           |
| Destroyer native Hyperspace profile is explained and compared at 1440px | Retain             | Comparison disclosure/checkbox wiring, visible selected column, responsive overflow; research unlock links where present.                                                                                                                                                                                                                           |
| Destroyer locked construction is explained at 390px                     | Move + consolidate | `Destroyer catalog contract` → `retains each prerequisite, its exact level and its visible blocker`; Battleship locked form journeys retain disabled Build and browser geometry.                                                                                                                                                                    |
| Destroyer locked construction is explained at 1440px                    | Move + consolidate | `Destroyer catalog contract` → `retains each prerequisite, its exact level and its visible blocker`; Battleship locked form journeys retain disabled Build and browser geometry.                                                                                                                                                                    |

### fusion-reactor.spec.ts

| Original expanded scenario                                          | Disposition | Named protection / browser reason                                                                 |
| ------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------- |
| Fusion shows fuel-limited output and saves requested duty at 320px  | Retain      | Fuel-limited row, accessible Deuterium icon, keyboard duty slider submission and 320/1440 layout. |
| Fusion shows fuel-limited output and saves requested duty at 1440px | Retain      | Fuel-limited row, accessible Deuterium icon, keyboard duty slider submission and 320/1440 layout. |

### heavy-fighter.spec.ts

| Original expanded scenario                                                         | Disposition                 | Named protection / browser reason                                                                                                                                                                                         |
| ---------------------------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Heavy Fighter exposes its missing Impulse Drive prerequisite                       | Move + consolidate          | `HeavyFighter catalog contract` → `retains each prerequisite, its exact level and its visible blocker`; Battleship locked form journeys retain disabled Build and browser geometry.                                       |
| Heavy Fighter submits the selected build quantity                                  | Retire after repeat failure | `HeavyFighter catalog contract` → all six cases; `Heavy Fighter acceptance retains the quoted costs and green HUD result`; Large Cargo form journey. See failure record; no recreation of the retired browser journey.    |
| Heavy Fighters can be selected, quoted and launched in an attack fleet             | Move + consolidate          | `HeavyFighter catalog contract` → `keeps its exact inventory and accepts its selected fleet composition`; Cruiser attack and Large Cargo transport journeys retain selected composition, quoted result and launch wiring. |
| manufacturing crosses the live affordability threshold at 390px                    | Retain                      | Clock-to-render affordability, submitted result, quantity reset and narrow-layout assertion; production controller extraction belongs to parent integration.                                                              |
| manufacturing crosses the live affordability threshold at 1440px                   | Retain                      | Clock-to-render affordability, submitted result, quantity reset and narrow-layout assertion; production controller extraction belongs to parent integration.                                                              |
| concurrent spending during validation recovers without a stale affordability error | Retain                      | Explicitly held validation response, resource refresh, pending control and recovery UI; no uncontrolled clock advance.                                                                                                    |
| manufacturing affordability follows the selected planet                            | Retain                      | Actual planet selector changes manufacturing affordability and missing-resource UI.                                                                                                                                       |

### hyperspace-drive.spec.ts

| Original expanded scenario                                      | Disposition        | Named protection / browser reason                                                                                                                                                                                   |
| --------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hyperspace Drive can be inspected and researched at 390px       | Retain             | Catalog-to-detail navigation, browser artwork naturalWidth, native disclosure, technology dialog, command result and responsive geometry.                                                                           |
| Hyperspace Drive shows unmet prerequisites at 390px             | Retain             | Research blocker panel at both widths with actual overflow assertion; static render cannot replace geometry.                                                                                                        |
| Hyperspace Drive can be inspected and researched at 1440px      | Retain             | Catalog-to-detail navigation, browser artwork naturalWidth, native disclosure, technology dialog, command result and responsive geometry.                                                                           |
| Hyperspace Drive shows unmet prerequisites at 1440px            | Retain             | Research blocker panel at both widths with actual overflow assertion; static render cannot replace geometry.                                                                                                        |
| Hyperspace Drive remains unavailable before universe activation | Move + consolidate | `HyperspaceDrive hides disabled technical content and unlocks`; retained `Hyperspace Technology can be inspected and researched without enabling its drive` asserts disabled research control in the real consumer. |

### hyperspace-technology.spec.ts

| Original expanded scenario                                                                 | Disposition        | Named protection / browser reason                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------ | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Hyperspace Technology can be inspected and researched without enabling its drive at 390px  | Retain             | Catalog-to-detail navigation, browser artwork naturalWidth, native disclosure, technology dialog, command result and responsive geometry.                                                                                |
| Hyperspace Technology shows unmet prerequisites at 390px                                   | Retain             | Research blocker panel at both widths with actual overflow assertion; static render cannot replace geometry.                                                                                                             |
| Hyperspace Technology can be inspected and researched without enabling its drive at 1440px | Retain             | Catalog-to-detail navigation, browser artwork naturalWidth, native disclosure, technology dialog, command result and responsive geometry.                                                                                |
| Hyperspace Technology shows unmet prerequisites at 1440px                                  | Retain             | Research blocker panel at both widths with actual overflow assertion; static render cannot replace geometry.                                                                                                             |
| Hyperspace Technology remains unavailable before universe activation                       | Move + consolidate | `HyperspaceTechnology hides disabled technical content and unlocks`; retained `Hyperspace Technology can be inspected and researched without enabling its drive` asserts disabled research control in the real consumer. |

### industrial-buildings.spec.ts

| Original expanded scenario                   | Disposition | Named protection / browser reason                                                                                                             |
| -------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Shipyard industrial lifecycle at 390px       | Retain      | Manufacturing lock refresh, upgrade, active work, demolition and confirmation dialog; separate Nanite technical link and responsive geometry. |
| Shipyard industrial lifecycle at 1440px      | Retain      | Manufacturing lock refresh, upgrade, active work, demolition and confirmation dialog; separate Nanite technical link and responsive geometry. |
| NaniteFactory industrial lifecycle at 390px  | Retain      | Manufacturing lock refresh, upgrade, active work, demolition and confirmation dialog; separate Nanite technical link and responsive geometry. |
| NaniteFactory industrial lifecycle at 1440px | Retain      | Manufacturing lock refresh, upgrade, active work, demolition and confirmation dialog; separate Nanite technical link and responsive geometry. |

### large-cargo.spec.ts

| Original expanded scenario                                             | Disposition        | Named protection / browser reason                                                                                                                                                 |
| ---------------------------------------------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Large Cargo exposes its missing Shipyard prerequisite                  | Move + consolidate | `LargeCargo catalog contract` → `retains each prerequisite, its exact level and its visible blocker`; Battleship locked form journeys retain disabled Build and browser geometry. |
| Large Cargo exposes its missing Combustion Drive prerequisite          | Move + consolidate | `LargeCargo catalog contract` → `retains each prerequisite, its exact level and its visible blocker`; Battleship locked form journeys retain disabled Build and browser geometry. |
| Large Cargo stays unavailable before its universe enables it           | Move + consolidate | `LargeCargo catalog contract` → `renders universe unavailability without leaking technical statistics`; Battleship unavailable form journey retains disabled Build.               |
| Large Cargo submits the selected build quantity at 390px               | Retain             | Representative quantity form, cost controls, command/result wiring. Battleship also retains catalog/detail/result geometry and comparison interaction.                            |
| Large Cargo submits the selected build quantity at 1440px              | Retain             | Representative quantity form, cost controls, command/result wiring. Battleship also retains catalog/detail/result geometry and comparison interaction.                            |
| Large Cargos can be selected, quoted and launched in a transport fleet | Retain             | Representative attack (Cruiser) or transport (Large Cargo) selection, quote composition and launch command wiring.                                                                |

### locked-buildings.spec.ts

| Original expanded scenario                                                                                                     | Disposition | Named protection / browser reason                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------ | ----------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| body restrictions remain inspectable from facility and resource cards                                                          | Retain      | Keyboard/touch inspection, route links, no forbidden quote/command requests, live prerequisite refresh and actual body restriction UI. |
| locked buildings at 1440px > unavailable facilities and resource buildings remain inspectable without construction requests    | Retain      | Keyboard/touch inspection, route links, no forbidden quote/command requests, live prerequisite refresh and actual body restriction UI. |
| locked buildings at 1440px > prerequisites show current levels and server blockers prevent construction in both building lists | Retain      | Keyboard/touch inspection, route links, no forbidden quote/command requests, live prerequisite refresh and actual body restriction UI. |
| locked buildings at 390px > unavailable facilities and resource buildings remain inspectable without construction requests     | Retain      | Keyboard/touch inspection, route links, no forbidden quote/command requests, live prerequisite refresh and actual body restriction UI. |
| locked buildings at 390px > prerequisites show current levels and server blockers prevent construction in both building lists  | Retain      | Keyboard/touch inspection, route links, no forbidden quote/command requests, live prerequisite refresh and actual body restriction UI. |
| locked buildings at 320px > unavailable facilities and resource buildings remain inspectable without construction requests     | Retain      | Keyboard/touch inspection, route links, no forbidden quote/command requests, live prerequisite refresh and actual body restriction UI. |
| locked buildings at 320px > prerequisites show current levels and server blockers prevent construction in both building lists  | Retain      | Keyboard/touch inspection, route links, no forbidden quote/command requests, live prerequisite refresh and actual body restriction UI. |

### research-network.spec.ts

| Original expanded scenario                                                               | Disposition | Named protection / browser reason                                                                                      |
| ---------------------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------- |
| research network preserves linked labs across submission and planet navigation at 390px  | Retain      | Submitted linked labs stay fixed through refresh and planet navigation; actual lab disclosure and responsive geometry. |
| Research Lab links to its new network unlock at 390px                                    | Retain      | Real Research Lab unlock link opens network details.                                                                   |
| research network cannot bypass the origin lab requirement at 390px                       | Retain      | Research disabled control and visible origin blocker with responsive geometry.                                         |
| research network preserves linked labs across submission and planet navigation at 1440px | Retain      | Submitted linked labs stay fixed through refresh and planet navigation; actual lab disclosure and responsive geometry. |
| Research Lab links to its new network unlock at 1440px                                   | Retain      | Real Research Lab unlock link opens network details.                                                                   |
| research network cannot bypass the origin lab requirement at 1440px                      | Retain      | Research disabled control and visible origin blocker with responsive geometry.                                         |

### solar-satellite.spec.ts

| Original expanded scenario                                                                      | Disposition | Named protection / browser reason                                                                                               |
| ----------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------- |
| satellites require Shipyard 1 and show stationary statistics and local energy                   | Retain      | Distinct stationary unit, local energy, selected-planet state or production-slider wiring; actual assertions retained verbatim. |
| satellites manufacture by quantity but never appear in fleet selection                          | Retain      | Distinct stationary unit, local energy, selected-planet state or production-slider wiring; actual assertions retained verbatim. |
| production controls show satellite quantity and submit group throttling                         | Retain      | Distinct stationary unit, local energy, selected-planet state or production-slider wiring; actual assertions retained verbatim. |
| satellite ordering shows authoritative planet output without technical expansion at 320px       | Retain      | Distinct stationary unit, local energy, selected-planet state or production-slider wiring; actual assertions retained verbatim. |
| satellite ordering shows authoritative planet output without technical expansion at 1440px      | Retain      | Distinct stationary unit, local energy, selected-planet state or production-slider wiring; actual assertions retained verbatim. |
| satellite ordering updates across planets, zero stationed satellites and unavailable production | Retain      | Distinct stationary unit, local energy, selected-planet state or production-slider wiring; actual assertions retained verbatim. |

### terraformer.spec.ts

| Original expanded scenario                                        | Disposition | Named protection / browser reason                                                                                         |
| ----------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------- |
| Terraformer fields, energy, cancellation and completion at 390px  | Retain      | Energy/field blocker refresh, cancellation dialog, completed field count, unavailable demolition and responsive geometry. |
| Terraformer fields, energy, cancellation and completion at 1440px | Retain      | Energy/field blocker refresh, cancellation dialog, completed field count, unavailable demolition and responsive geometry. |

## Failure history and validation

### Heavy Fighter submission retirement

The parent's unchanged baseline reported `Heavy Fighter submits the selected
build quantity` failed on its first attempt (case 731, `/tmp/orbit-ui-before.log`).
The retained error context and image are under the parent's
`test-results/browser-ui/heavy-fighter-Heavy-Fighte-a7ec4-the-selected-build-quantity/`.
The captured page is still Empire overview, before manufacturing. The November 5
entry in [the repair ledger](../runbooks/test-performance-audit.md#november-5-2026-response-gated-shared-shell-startup)
records the earlier `main h1` startup failure and its one response-gating repair
(PR #347, run 42065953092, integration 5a143f0cc1e8e79f4994bbc664a4d2808d798404).
The ledger explicitly requires removal on a subsequent failure. Git history
through `2d6f226a` and `e1c70cdf` was checked. No infrastructure incident was
provided as the cause of this local assertion failure. No second stabilization
patch or lucky rerun was made.

The lost item-specific browser check is a Heavy Fighter accepted toast with
12,000 metal / 8,000 crystal and a green orb. The new Heavy Fighter HUD model
case protects exactly those quote costs, shipyard title and green orb state;
`command-hud.spec.ts`'s pre-existing `real defense confirmation shows the quoted
action in the mobile HUD` covers rendering of a manufacturing acceptance and
green orb (owned by the HUD migration chat). The original Heavy Fighter journey
is not recreated under another name. Other item forms retain the shared actual
quantity input/submission/result integration.

### Local validation record

Validation source revision: base `a119915ffaeb881a7f54d65542478f4788bd4210`
plus the scoped source/test changes in this commit. The 56-case browser run used
that source **before** the final industrial demolition-state assertion; those
four changed cases require validation on the integrated revision.

All validation commands explicitly used
`PATH=/opt/homebrew/opt/node@24/bin:$PATH` (Node 24.18.0).

- Setup: `npm ci --ignore-scripts` completed in 23 s. Host-default Node 23/npm 10
  produced engine warnings during installation; actual checks used pinned Node 24.
- `npm test -- src/features/progression/catalog-content-migration.test.ts`: final
  46 cases passed in 4.50 s. The initial authoring run had 11 expectation errors
  (HTML wrapper assumption, four assumed 640px artwork paths, and Cruiser
  prerequisite ordering). One explained correction preserved exact current/required
  levels, selected canonical 1200px assets, and the defined prerequisite order;
  the following 43-case run passed in 4.96 s. Later additions were checked separately.
- Focused tests across the 11 files listed above: 140 passed in 7.71 s before the
  final additional Heavy Fighter HUD case. The final 46-case file run includes it.
- Focused ESLint, Prettier, `git diff --check`, and `tsc --noEmit -p apps/web` passed.
  The type check completed before the parent's validation coordination request.
- Browser command: `npm run test:ui -- battlecruiser.spec.ts battleship.spec.ts
bomber.spec.ts cruiser.spec.ts destroyer.spec.ts heavy-fighter.spec.ts
large-cargo.spec.ts solar-satellite.spec.ts fusion-reactor.spec.ts
hyperspace-drive.spec.ts hyperspace-technology.spec.ts industrial-buildings.spec.ts
locked-buildings.spec.ts research-network.spec.ts terraformer.spec.ts --workers=1`.
  Module preparation: 10.425 s. Of 56 cases, 39 completed: **36 passed, 3 failed**;
  17 are incomplete (the 320px locked-building case was in progress). Completed
  case durations sum to 498.9 s; this is not total runner wall time. Runner queue
  wait was not instrumented; no PR, merge queue or merge delay applies.
- The parent reported host load 45.5 on 12 cores and explicitly requested stopping
  competing validation. This worktree's runner PID 71225 was sent SIGINT; the
  wrapper stopped its own Playwright child and closed its Vite server. Exit 130 is
  interrupted validation, not success. PIDs 71225/71276/79027 were confirmed gone.
  No other chat's processes were stopped. No browser/build/typecheck rerun followed.
  The wrapper's termination did not flush Playwright's final JSON/error stack;
  list output and already-written failure images/DOM contexts remain available.

#### Three failures awaiting classification in the coordinated window

- `Battlecruiser comparison and research unlocks at 1440px` (33.3 s): captured
  Laser Technology detail has loaded, Confirm research is available, and Technical
  data is collapsed. Earlier history includes response-gated navigation in
  `6292946b` and optional diagnostic preparation in `a9eeb6fc`. No scenario-specific
  previous failure/repair entry was found in the repair ledger. Missing final
  assertion stack prevents determining whether the issue is click/navigation,
  disclosure, or an assertion boundary. No speculative fix or unchanged retry.
- `locked buildings at 1440px > unavailable facilities and resource buildings
remain inspectable without construction requests` (23.9 s), and its 390px
  counterpart (22.8 s): the captured Facilities catalog has its heading focused,
  with no detail pane. Inspected Git history (`6292946b`, `762f76ee`, `6ad8a3f8`)
  and the repair ledger; no earlier case-specific repair record found. A route
  focus race is a hypothesis, not a proven diagnosis without the failed assertion
  stack. Both cases remain unchanged for the parent to classify; this handoff is
  not a green readiness claim. The 320px teardown image is cancellation evidence,
  not a fourth failed test.

Host contention is contextual evidence only; it does not excuse these assertions
or authorize rerunning unexplained failures. Parent owns the coordinated final
validation and classification, including applying the one-repair rule once the
failing boundary is established. Do not count the three failures as infrastructure
incidents without evidence, or silently reset any historical repair count.

#### Industrial lifecycle teardown boundary

All four original industrial lifecycle cases passed, but emitted backend proxy
errors near teardown for `/reports`, `/social/query`, `/world` and
`/progression-options`. Inspection found the final demolition path stopped at
`sent[1]` plus geometry; unlike its upgrade path, it never asserted that the
resulting construction state had reached the UI. The scoped change now awaits
`Active construction` after demolition. That is the missing observable result,
not a sleep, timeout increase, or assertion weakening. Its effect on the escaped
requests remains unverified because the coordinated pause arrived before a
focused run. Shared fixture network enforcement/cleanup stays parent-owned.

The audit checked the other owned command endings: ship submissions assert an
accepted result, production sliders assert applied settings, research submissions
assert active cancel controls, and Terraformer asserts cancellation/completion
state. The fixture request leak may still require a shared cleanup fix; a passing
assertion alone would not close it. Parent has the explicit delivery path through
its shared-fixture integration work and final four-case industrial check.

Local evidence is preserved under `test-results/catalog-migration-evidence/`
(browser log, focused-unit logs, type/lint logs, expanded inventories and copied
failure artifacts). No screenshots were committed or uploaded. No production UI
changed, so UI screenshot review for product changes does not apply.


## Integrated verification

The parent integrated this group and completed serial validation. See the
[combined verification record](test-strategy-overhaul.md) for final inventory,
passing runs, repairs, retained failures, visual evidence and cleanup. Earlier
“pending parent validation” entries above describe the historical handoff.
