# UI components and styles

Use shared React components for styled elements and compose them into feature components. Plain, unstyled HTML wrappers are fine; a new component should own a visual pattern or behavior.

- `style.css` is only for document defaults, resets, global focus/scroll behavior, and the no-animation policy. Shared design values live in `styles/tokens.css`.
- Keep component styles in an adjacent `*.module.css` file. Import the module in its owner, and keep responsive rules there too. Do not use global feature classes or `:global` escape hatches.
- Reuse `Button`, `ButtonLink`, `Link`, form controls, `Panel`, `Section`, typography, and the catalog/quote components before adding a new visual pattern.
- Choose explicit variants (`<Button variant="quiet">`, `<Panel tone="accent">`). Never infer an action's visual meaning from its position among siblings.
- Shared primitives use low-specificity `:where(...)` selectors. A consumer's local `className` can set layout without depending on stylesheet import order. Component-local descendant selectors are appropriate for markup owned by that component; avoid reaching into another feature's implementation.
- Use tokens for shared colors, spacing, type sizes, radii, and touch targets. Keep one-off illustration and layout measurements local. CSS media/container query thresholds remain literal because custom properties cannot be used in those conditions.
- Components preserve native HTML props, refs, events, and semantics. Buttons retain native form submission behavior; use `type="button"` for non-submit controls inside forms. `Link`, `ButtonLink`, and `Brand` are typed TanStack links: use `to`/`params`/`search` (usually spread from `routeTarget`) for internal navigation. `Button` performs an action.
- Use `Heading`'s `level` to preserve document hierarchy, `Field` to wrap a labeled control, and `VisuallyHidden` for accessible announcements. Never replace semantic elements with clickable `div`s.
- Browser tests select roles, labels, and accessible names, not generated CSS Module classes.

A feature can compose existing components without needing its own stylesheet. Add local CSS when that feature has layout or appearance of its own. Extract a new shared component when a real pattern repeats; do not add a general layout framework for hypothetical future screens.

## Routes

Add screen routes in `src/routes`; TanStack generates `routeTree.gen.ts` (do not edit it). Run `npm run routes` after adding or renaming files; dev and production builds also generate the tree. Route modules declare their page metadata and screen component. Keep the confirmed session/coordinator in the root App and common chrome in GameShell; screens render through its Outlet.

`resolveDestination` checks planet ownership, protocol capabilities and item visibility against each confirmed view. It does not parse URLs. Preserve those checks when extending routes. Build catalogs, research, fleets, galaxy, and dispatch use `/u/$universe/b/$body/...`. Catalog items add a stable kebab-case item segment. Research levels remain universe-wide; the path identifies the host/funding body. Legacy query-context URLs redirect to the canonical planet path. Reports and account settings retain their existing routes. Never silently replace an explicit inaccessible planet.

Use native browser links for external destinations and same-page non-navigation helpers. Preserve route title/focus behavior, keyboard menu restoration, and direct-link login. Tests must cover browser-history navigation and actual server refreshes, since Vite's development fallback alone cannot prove production hosting works.

## Editorial game shell

The shell uses a compact horizontal masthead and ledger, with four stable anchors: Empire, Build, Fleet, Menu. Build defaults to Resources and exposes the five implemented build destinations in secondary navigation. Fleet groups activity and Dispatch. The grouped modal Menu contains real implemented destinations only, with capability-unavailable entries disabled. At phone sizes the same anchors form the safe-area-aware thumb dock. There are no permanent desktop rails or in-game footer.

On phones, a compact planet box shares one row with the resource ledger. Its image, body kind, and coordinates form one native selection target; text truncates with ellipses while the picker retains full labels. The next-body shortcut stays on desktop. Larger rosters keep their search field on a full-width row below the phone ledger. The selected body remains visible before the ledger on desktop. `BodySelector` preserves route/funding context, offers search for rosters larger than eight worlds, and groups real moons with planets at matching coordinates. No display name is invented when the DTO only supplies kind/coordinates.

Use `Popover` for read-only details that should work on hover, keyboard focus, or tap. It uses Floating UI for viewport-aware positioning, dismissal, and focus handling. Exact resource amounts, storage, and production stay in the popover while the strip shows whole stock quantities. On every screen, the strip shows material icons and compact balances using K, M, B, and T with no suffix spacing. Balances below ten units of a suffix retain one decimal; larger balances use whole units, always floored. Full storage and energy shortfalls color the balance; names, capacity, production, and warning explanations remain available in the tap details. Keep full values in action/quote flows.

Use `ResourceAmount` for resource icons with amounts and contextual details. Its `stock` variant shows a material silhouette and compact amount; names, capacity, production and warning explanations belong in the shared hover/focus/tap popover. Over-capacity balances remain amber and energy shortages red. `ResourceStrip` supplies the live stock details; `ResourceCosts` keeps exact quoted costs, current availability, and live shortfalls in its decision table. Keep calculations derived from the current view rather than copied into local state.

On desktop and tablet, the planet selector and resource strip share one 64px minimum-height outer row. That outer row owns both full-width horizontal borders; neither child draws a separate border. On phones the compact planet/resource row sticks to the viewport top with a subtly translucent full-width background, light backdrop blur, a thin gold bottom border and safe-area padding. Content scrolls underneath it; resource popovers and the navigation dialog remain above it. The row stays in normal flow before scrolling, including expanded roster search and enlarged text.

The shared live view derives balances and pending work from the confirmed snapshot, elapsed time, and submitted command inputs. While an optimistic action awaits its receipt, a higher-revision snapshot is held back if it could already contain that action. Pending indicators therefore describe estimated work against the last confirmed snapshot; they do not assert server completion. Existing receipt polling resolves the ambiguity before the next snapshot is adopted, preventing both temporary payment rollbacks and duplicate deductions.

Unavailable implemented destinations are native disabled buttons; future Empire, Alliance, Highscore, and Messages destinations are omitted from active navigation. Do not add purchase, lifeform, population, or premium-currency controls. Artwork and generation prompts live in `public/art`.

The isolated shell browser tests intercept only the HTTP boundary and validate real route, popover, and responsive behavior. With the dev server running, use `ORBIT_TEST_BASE_URL=http://127.0.0.1:5173 npx playwright test shell.spec.ts`. They do not replace the database-backed progression and mission journeys.

Overview composes real selected-body arrivals, ordered work, exact stationed inventory, and a noninteractive world illustration. `WorkSummaries layout="editorial"` preserves queue order, cancellation and uncertain statuses while using aligned rows. Research names its actual host. Progress is estimated only from available timestamps; construction has no invented progress percentage. Deadline expiry continues to await server confirmation. Construction status and cancellation belong in work summaries and building details; do not add a duplicate status panel to the shared shell.

UI changes are immediate: do not add animations, CSS transitions, smooth scrolling, or View Transitions. Navigation keeps the shell and resource ledger mounted. Keep focus management and live game clock updates independent of visual effects.

## Image catalogs

Use `CatalogStage` for inline item details and optional catalog controls. Do not add expandable colony or scene overviews. It provides focus entry only; Escape never navigates away from item pages. The URL is the sole source of selected item state. Catalog tiles and Back controls are real links, with local edit state scoped to each item and planet. Preserve asynchronous request fencing and focus restoration to the tile. Closed details are hidden, inert, and excluded from the accessibility tree.

Compose `CatalogSection`, `ImageCatalog`, `ImageTile`, and `CatalogImage` for compact image catalogs. `CatalogArt` supports a regular image or a local sprite atlas with explicit row/column and cell proportions; atlas crops preserve their source aspect ratio in any container. Tile levels come from confirmed state; missing content is disabled. `ResourceCosts` displays exact quoted costs and marks resource shortfalls. `WorkSummaries` is shared by Overview and Resources.

Building grids pass `ImageTile` progress derived by `buildingProgress` from the existing game store. The overlay shows the target level, direction, and countdown while keeping the confirmed level in the caption. Submitted work appears as confirming, uncertain or cancelling work stays explicit, and an elapsed timer waits for server confirmation rather than changing the level locally.

Resource and facility building grids use `ProgressionTile` to inspect server upgrade costs before selection. Affordability is derived from those terms and current balances, so amber diagonal bands clear as resources accrue and return after spending. Tiles remain inspectable; unavailable or still-loading quotes never imply a resource shortage, and active construction keeps its progress overlay. Balance-only changes do not refetch the terms.

Tile cost queries are keyed by session binding, rules profile, building, body, and source level. Queue and field-reservation changes must not clear these cost inputs or flicker affordability. Details panes continue to use the broader progression context for current eligibility and command terms; cost-only results are never used to authorize an action.

Eligible building tiles expose a separate green up-arrow button for one-click upgrades. It uses a current full eligibility quote and the command coordinator's submission checks; the tile body still opens details. The arrow disappears while work is pending or blocked. A hammer badge denotes construction already in progress. Keep the arrow's 16px icon inside a full touch target.

Open an active building's details to see its countdown, refund, and cancellation action. Active work uses confirmed operations or submitted intents directly and does not depend on a fresh upgrade quote. Cancellation is disabled until an operation ID is confirmed and while another command is pending. Active research exposes cancellation in its own details. The global Current work disclosure has been removed.

Submitting a building upgrade, demolition, or research keeps its details pane open. It switches immediately to work derived from the submitted quote, then follows confirmation or rejection from the game store. Focus moves to the work heading without scrolling. Players dismiss the pane themselves; manufacturing also stays open while submitting and after confirmation.

Resources keeps upgrades/demolition behind server inspection and explicit confirmation. Selecting a different building or closing details invalidates pending inspections. Production settings remain mounted while closed to retain drafts; changing bodies resets the page through its existing body/session key. Production totals are server-confirmed aggregates, not per-building estimates or unsaved previews. Save retains the existing revision-conflict acknowledgment and command-recovery behavior.

Run the HTTP-fixture browser checks with the dev server running: `ORBIT_TEST_BASE_URL=http://127.0.0.1:5173 npx playwright test resources.spec.ts shell.spec.ts`.

## Technology catalogs and Galaxy

`TechnologyPage` composes the same catalog stage and image tiles for Facilities, Research, Shipyard, and Defense. Groups come from typed server catalog keys; disabled catalog entries remain disabled, while unmet prerequisites dim tiles without blocking inspection. Tile levels and stationed counts always use confirmed state. Counts remain decimal strings, including values larger than JavaScript's safe integer range.

`TechnologyDetails` derives manufacturing totals locally from per-unit terms. Quantity edits never fetch new terms. Build validates the exact order with the server, checks it against the displayed terms, and submits while keeping details open. Changed selections or quantities invalidate pending validation. Shipyard and defense use one ordered queue, including pending orders. `BuildingDetails` is shared with Resources. The reusable `TechnologyDialog` shows recursive catalog prerequisites, direct applications, and descriptions in a native modal with focus restoration, Escape dismissal, and keyboard tabs. It does not invent unavailable technology statistics.

Galaxy uses planet cards in normal page flow, with no nested scroll container or mobile table overflow. Player identity and activity sit below the planet; debris stays beside it. Each actionable card uses a native disclosure to reveal Transport, Attack, Espionage, and debris Harvest actions, preserving eligibility and preparing dispatch with the selected destination and mission. Navigation is bounded by universe settings; only the current system observation supplies actions. Current public usernames are supplied for visible players in a batch; missing names fall back to short player identifiers. Alliance data is not supplied by the API.

Run `ORBIT_TEST_BASE_URL=http://127.0.0.1:5173 npx playwright test catalog-pages.spec.ts galaxy-cards.spec.ts resources.spec.ts shell.spec.ts` for isolated browser coverage. `make test-progression` and `make test-missions` exercise real database-backed flows using disposable universes.
