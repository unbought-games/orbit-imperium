# Asset customization: delivery plan

> Implementation is now underway. [The approved first-slice contract](IMPLEMENTATION.md)
> supersedes older proposals below, especially shared bake keys and pinned emblems.

Date: 2026-11-16. **Status: agreed product direction, proposed implementation.**
This is the coordination entry point for future chats. It does not claim the
hangar, account library, skin catalogs, or generation service are implemented.

## Outcome

Build a canonical **Orbit collection** containing one recolorable skin for every
ship type. Players can make their fleet look like their empire using the standard
free colors and additional dyes/palettes they have unlocked. This is a visual
collection, not a new gameplay ship class, balance change, or individual-ship system.

There are three distinct pieces of work:

1. **Offline authored assets:** Ethan directs the shape, character and finished
   appearance of one skin; the agent prepares and verifies deterministic color
   controls. Iterative AI authoring is welcome. This work happens once per skin
   revision, not for each player's palette.
2. **In-game customization:** ordinary shipyard ordering remains the main flow.
   Customize opens a hangar/atelier, previews owned colors and markings locally,
   then saves/equips a finished appearance. The free path is attractive and usable
   without an AI render, subscription, or render currency.
3. **Player-generated images:** a separate creative branch with limited render
   currency, permanent generated revisions and provider-independent jobs. Custom
   image edits require another generation; they do not inherit deterministic masks.

The first delivery is **one Light Fighter end to end**, followed by the remaining
canonical collection. Player generation is a later independent track, not a
prerequisite for the free recoloring slice.

## Read by task

| Task                                                | Owning document                                                                                                                                                                          |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prepare a new ship, defense or building skin        | [Offline asset authoring](../../operations/recolorable-asset-authoring.md)                                                                                                               |
| Build the generic asset contract and renderer       | [Recolorable asset packages](../../architecture/recolorable-asset-packages.md)                                                                                                           |
| Build/save/equip the hangar experience              | This plan, especially the first slice and workstreams                                                                                                                                    |
| Build player AI generation and spending             | [Player-generated appearances](player-generated-appearances.md)                                                                                                                          |
| Understand the demonstrated renderer and its limits | [Concord finish study](../../../tools/ship-livery/FINISH.md)                                                                                                                             |
| Preserve existing content distribution/access rules | [ADR 002](../../architecture/adr-002-hosted-cosmetic-content.md), [operator guide](../../operations/empire-customization.md), [community rewards](../../operations/community-rewards.md) |

The detailed workflow is generic across asset categories. Ships are the first
product rollout; defenses and buildings use the same package capabilities later.
Research remains ordinary artwork unless a real coloring use case is approved.

## Decisions carried forward

| Decision                                                                                                                  | Status                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Ethan owns creative direction and visual acceptance; agent owns preparation, renderer behavior and technical verification | Agreed in the current authoring discussion                                                                                              |
| Generate/refine a beautiful master first; one or more colored reference generations may help author it                    | Agreed; no fixed generation count                                                                                                       |
| Authored skins have primary and accent color controls, with a protected remainder                                         | Agreed first product contract                                                                                                           |
| Ordinary player recoloring is deterministic, no inference or per-edit render spend                                        | Agreed and locally demonstrated                                                                                                         |
| Free players get a complete canonical collection and standard colors; unlocked colors extend choices                      | Agreed target; not yet delivered                                                                                                        |
| Customize is a separate hangar experience; routine ordering stays efficient                                               | Agreed in the ship customization discussion                                                                                             |
| Render spends; Equip and switching owned generated versions are free                                                      | Explicitly agreed                                                                                                                       |
| A generated appearance is owned by the account for one ship class, usable across universes after membership expires       | Explicitly agreed                                                                                                                       |
| Every new generated edit is another render; disliked successful results do not earn a refund                              | Explicitly agreed                                                                                                                       |
| Custom-generated images are edited only with AI; arbitrary player uploads are excluded                                    | Explicitly agreed                                                                                                                       |
| Exact generation allowance, pricing, failure charging and funding rules                                                   | Unresolved; see generation track                                                                                                        |
| Equipment per empire/target type; reusable account-owned authored designs                                                 | Agreed scope; immutable revisions and edits isolated to the current universe                                                            |
| Default canonical collection design language and final launch name                                                        | Owner decision before broad fleet art production; Concord is the approved technical seed, not automatic approval for all future designs |

Earlier discussion described deterministic coloring as a rough preview before
paid AI polish. The later Concord work and current direction supersede that
requirement: an authored deterministic livery is itself finished and equippable.
Paid custom generation is additional creative freedom. It is not the way to fix
a deliberately inferior free result. Earlier speculative totals such as ten
member collections are not a committed launch scope.

## Evidence and current implementation boundary

Source inspection for this plan used checkout
`6eafeb0c8397eb49ea4b2e1a0b75ed198b801784` plus the uncommitted art experiments.
Refresh the owning code and current main before implementation; this is not a
production-state audit as of November 16.

| Existing evidence/source                                                                                                                                   | Reuse or gap                                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `tools/ship-livery/finish-render.mjs`, `finish-authoring.mjs`, `export-finish.mjs`, `concord-finish-v2/`                                                   | Demonstrated one fixed view, two channels, protected glass/red glow, six palettes and offline edits. Prototype still hardcodes 1536 × 1024, reference swatches, source paths and selection assumptions. Generalization is work, not an existing generic SDK. |
| [Finish study](../../../tools/ship-livery/FINISH.md)                                                                                                       | Nine focused tests; repeated export hashes; offline browser verification; measured desktop renders around 75–92 ms. These are historical prototype observations, not mobile production budgets.                                                              |
| [Artwork resolver](../../../apps/web/src/ui/artwork.ts), [atlas exporter](../../../scripts/export-atlas-art.mjs)                                           | Static catalog/body artwork and responsive variants exist. No skin selection or owner-aware livery resolution is established here.                                                                                                                           |
| [Cosmetic catalog](../../../crates/application/src/cosmetic_catalog.rs), [cosmetic controls](../../../apps/web/src/features/rewards/cosmetic-controls.tsx) | Named account dyes, palette grouping and availability already exist. New official livery edits should reference dye IDs, not bypass unlocks with arbitrary hex values.                                                                                       |
| [Insignia storage](../../../crates/storage-postgres/src/insignias.rs), [identity ADR](../../architecture/adr-001-empire-customization.md)                  | Existing precedent for account-owned designs, universe equipment, optimistic revisions and derived fallbacks. Reuse principles, not the insignia recipe/schema for an unrelated asset type.                                                                  |
| [Community rewards](../../operations/community-rewards.md)                                                                                                 | Versioned catalogs and access observations exist. Current supported treatment surfaces do not automatically authorize a ship renderer. Extend negotiation/readers deliberately.                                                                              |
| [Ship types](../../../crates/engine/src/types.rs), [propulsion](../../../crates/engine/src/missions.rs)                                                    | Canonical target IDs and effective drive logic. Art never changes combat, costs, speed, ownership, counts or mission rules.                                                                                                                                  |

The prototype and screenshots are evidence, not merged production dependencies.
W0 must preserve the relevant source assets, tests and documentation in a durable
repository revision before another chat depends on them. Do not rely on a temp
clipboard path, ignored generated output, local preview port, or another chat's
uncommitted worktree as the only copy.

Discussion lineage for an owner/agent who can access Codex (the documents above
are self-contained for other contributors):

- [Review desktop shipyard page](codex://threads/01a1db69-d547-7a50-81ac-49a19a8be660)
- [Design ship customization flow](codex://threads/01a1dce9-c267-7920-aa72-8b36685cdff7)
- [Create light fighter image workflow](codex://threads/01a1dbfb-e58e-7d52-b71a-cbeb0565aa6f)
- [Create light fighter image workflow (2)](codex://threads/01a1dcfd-11f6-70e3-8895-5b18b2480a9b)

## First end-to-end slice: one Light Fighter

Use the approved finished Concord as the technical seed, with final collection
placement/naming decided by Ethan. Deliver one installed free skin, two color
channels, existing free/unlocked dye choices, durable saving and equipping, and
visible use outside the editor. Real empire emblems are desired in this slice;
the [Concord quality proof](../../../tools/ship-livery/EMBLEMS.md) now demonstrates
static full-badge and painted-layer options on authored wing slots, pending owner
visual review and W1 conversion. Gate the initial Shipyard/hangar experience behind
a development-only UI gate. No generation provider or spending system is
needed for this slice.

The journey:

1. A player opens Shipyard on a canonical body route and selects Light Fighter.
2. Customize opens the hangar, retaining the originating body and selection.
   Ordering remains available in the ordinary shipyard; this action creates no
   build order and spends no resources or render currency.
3. The owned/available palette changes primary and accent locally. Draft changes
   do not equip automatically. A locked swatch may be previewed only if clearly
   labeled; it cannot be saved/equipped as an authorized choice.
4. Save and equip commits an account-owned recipe and that empire's selection
   atomically with current server-side access checks and an optimistic revision.
   The UI confirms server acceptance; uncertain retries reconcile safely.
5. Returning to Shipyard shows the equipped Light Fighter appearance. The owned
   Light Fighter thumbnail in fleet inventory uses the same resolved appearance.
6. Reloading and reopening retain the selection. Joining/switching to another
   universe can reuse the account's saved design; equipment is selected for that
   empire independently. Saved recipes have immutable revisions; editing/equipping
   in this universe does not change another universe's selected revision.
7. Missing assets, expired access observations, unavailable catalogs or lost dye
   access derive a free fallback. Saved selections and grants remain intact;
   fallback must not block ordering or fleet actions.

Completion means the journey works on desktop and mobile against real local
persistence with server authorization, not only a standalone gallery or mocked
save. Use focused deterministic/HTTP/database checks for logic and a small browser
journey for navigation, focus, color interaction, reload and visible application.
Any full-system acceptance remains explicitly invoked under repository test rules.

Saved revisions include transparent baked images and appropriate size variants.
Identical pixel inputs share bakes across accounts and universes. Include emblem
composition/art revisions, colors and placement in bake identity; ownership and
equipment are separate from byte deduplication. See the package contract.

Required first-slice acceptance:

- A free account can finish, save and equip an attractive two-color livery with
  no AI request, render-credit check or membership requirement.
- An earned/unlocked dye works; forged locked dye IDs, wrong skin/target bindings,
  cross-account design IDs and stale edits are rejected server-side.
- Current equipment applies to that owner's ship class across their bodies; it
  does not recolor another player's ships or the global catalog for every viewer.
- One authoritative appearance resolver feeds the hangar, Shipyard and inventory.
  No duplicated color math or persisted effective/fallback state per screen.
- Legacy atlas art remains a valid fallback during gradual rollout. Unsupported
  clients/loaders receive compatible data; strict old schemas are not silently
  expanded without a negotiation/migration plan.
- Corrupt/misaligned maps and missing package revisions fail validation; graceful
  runtime fallback and retained choices are verified.
- Real insignia layers/colors remain intact under the chosen full-badge or
  painted-layer treatment; no automatic palette matching. Changing an emblem
  input changes the bake key, while another account with identical rendering
  inputs can reuse the same bake. Other universes retain their pinned revisions.
- No change to gameplay quotations, orders, fleet counts, simulation or resources.
- Final desktop/mobile screenshots include equipped art outside the editor.

## Data and interaction boundaries

The following are proposed contracts for W1/W2 to finalize, not implemented tables:

| Record                    | Authoritative contents                                                                                                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Installed skin catalog    | Stable collection/skin/target IDs, access policy and immutable package revision                                                                                                            |
| Account appearance design | Owner ID, compatible target, authored recipe revision, skin/package references and selected dye IDs; immutable emblem composition/art and explicit authored placement/treatment references |
| Empire equipment          | Empire identity (including epoch where applicable), target kind/ID and owned design revision or generated appearance ID                                                                    |
| Optional empire palette   | Explicit player-selected dye IDs; policy for applying it to designs is decided before adding inheritance                                                                                   |
| Generated appearance      | Separate immutable owned image revision and generation provenance; never a falsely editable authored recipe                                                                                |

A ship class is a cosmetic target; Orbit counts ships in stacks and does not gain
one appearance row per individual ship. All copies of that class within an empire
share its selected appearance in the first model. Account ownership survives an
empire's deletion/reset; selection for a new empire follows normal explicit setup.

The renderer receives resolved display colors. The server validates dye IDs and
ownership, and derives availability/fallback from the installed catalog and current
evidence. Do not store resolved URLs, effective hex copies, supporter flags or
rendered previews as authoritative gameplay state. Derived thumbnail caches are
replaceable output artifacts, keyed by all immutable inputs, never ownership truth.

For other viewers, resolve the **owner's** equipped appearance and access, not the
viewer's dye unlocks. Preserve existing visibility/anonymization boundaries. When
reports gain customized art, capture event-time appearance revision references;
changing today's livery must not rewrite historical fleet identity.

Keep local drafts local and shared server observations in the existing Zustand
pattern. Palette collections organize available dyes; they do not become a second
source of entitlement. An “apply to fleet” operation must have explicit semantics
(one-time batch assignment versus live inheritance) before implementation. Do not
store both inherited and duplicated authoritative colors.

## Hangar direction

The ordinary Shipyard optimizes selecting and ordering ships. A separate Customize
entry opens the cinematic space: large central craft, restrained controls, a clear
save/equip action, and an easy return to the originating task. Mobile uses the same
capabilities with usable touch controls and natural scrolling; avoid forcing the
desktop showroom layout onto a phone. Keep loading, draft, saved and equipped
states distinct and preserve edits during asset loading.

Use `routeTarget` and `/u/<universe>/b/<body>/...` paths if adding a hangar route;
never introduce selected-body query parameters. Final route versus modal ownership
is W3's design decision. Both approaches must support back navigation/focus return
without losing planet/moon context. Follow the UI skill and design guide before
implementation. These docs introduce no new UI and need no new UI screenshots.

Emblem projection is desired in the first slice, with the local quality proof now
available for owner review: use the existing owned insignia composition and
authored placement slots, clip to surfaces, and respect access. Preserve player
colors; background removal is an explicit treatment, not an automatic change.
The Concord benchmark contains baked accent stripes; do not claim it already
supports removing those stripes or freely placing an arbitrary emblem. Additional
finishes/effects likewise require real renderer support and reviewed assets.

## Workstreams and dependencies

Each row is a bounded future chat/PR. **Not started** means no production work is
claimed; this document does not create chats, assign active agents, or merge work.

| ID / future owner role           | Deliverable and boundary                                                                                                                                                                                                            | Depends on                                                                            | Current status / completion evidence                                              |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| W0 / integration owner           | Preserve the accepted prototype, source hashes, tests and these docs in durable version control; separate reusable core from exploratory artifacts                                                                                  | None                                                                                  | Prototype local/uncommitted; no preservation PR yet                               |
| W1 / asset tooling owner         | Finalize package v1; remove Concord dimensions/swatches/paths from reusable renderer; generic compiler/exporter, trusted renderer registry and manifest validation; retain a golden Concord result and a differently shaped fixture | W0                                                                                    | Not started; [package proposal](../../architecture/recolorable-asset-packages.md) |
| W2 / application/data owner      | Installed skin lookup, account design library, empire equipment, dye authorization, optimistic/idempotent mutations, delivery and derived fallback                                                                                  | W1 contract frozen                                                                    | Not started; API/schema names and migrations to be selected here                  |
| W3 / UI owner                    | Hangar entry and draft/editor experience using shared renderer and existing dye controls; no provider UI or new currency                                                                                                            | W1 contract; W2 API for final integration                                             | Not started; fixture design can precede persistence completion                    |
| W4 / integration owner           | Connect W1–W3 for Light Fighter; owner-aware resolver in Shipyard and inventory; first-slice acceptance, rolling compatibility and screenshots                                                                                      | W1, W2, W3                                                                            | Not started; first real end-to-end milestone                                      |
| W5 / art owner + authoring agent | Canonical Orbit collection: repeat the offline workflow per ship, track creative/package approval independently, publish compatible free packages                                                                                   | W1 and owner-approved collection language; W4 before broad activation                 | Only Light Fighter technical seed exists                                          |
| W6 / presentation owner          | Propagate selected appearance to Dispatch, other fleet surfaces, permitted profiles and event-time report artwork; additional emblem capabilities and batch palette actions as scoped additions                                     | W4; per-surface visibility/history contract                                           | Not started                                                                       |
| W7 / generation owner            | Account-owned generated revision library, provider abstraction, render currency ledger/jobs and generation UI                                                                                                                       | W2 appearance boundary; generation decisions resolved; real-money activation separate | [Separate track](player-generated-appearances.md), not a W4 blocker               |

W1/W2 must agree on target IDs, immutable package reference, capability negotiation,
recipe shape and fallback behavior before independently implementing clients.
Parallel implementation can proceed once those contracts are fixed. Assign one
validation owner and serialize browser suites, builds and full typechecks on the
shared machine; follow repository testing rules. Necessary code/CI follow-through
belongs to each originating implementation chat under the usual PR rules.

A handoff records: actual owner chat/PR, exact revision, files/contracts changed,
input/output package IDs and hashes, tests and phase timings, current screenshots
when UI changed, unresolved failures/decisions, cleanup, and the next dependency.
Update this table with evidence when a workstream starts or lands. Do not mark a
workstream complete from a proposal, successful retry alone, or standalone demo.

## Canonical collection inventory

The inspected engine enumerates 14 ship targets. Reconcile this inventory with
current rules and enabled catalog entries when work starts; do not treat an old
worktree's list as permanently complete. Use canonical `Dreadnought`, not its
legacy deserialization alias `Deathstar`.

| Target         | Art direction / finished master                                                         | Recolor package                         | In-game activation |
| -------------- | --------------------------------------------------------------------------------------- | --------------------------------------- | ------------------ |
| LightFighter   | Concord accepted as technical quality reference; canonical collection placement pending | Prototype proven; W1 conversion pending | W4 pending         |
| HeavyFighter   | Pending                                                                                 | Pending                                 | Pending            |
| SmallCargo     | Pending                                                                                 | Pending                                 | Pending            |
| LargeCargo     | Pending                                                                                 | Pending                                 | Pending            |
| Cruiser        | Pending                                                                                 | Pending                                 | Pending            |
| Battleship     | Pending                                                                                 | Pending                                 | Pending            |
| Battlecruiser  | Pending                                                                                 | Pending                                 | Pending            |
| Bomber         | Pending                                                                                 | Pending                                 | Pending            |
| Destroyer      | Pending                                                                                 | Pending                                 | Pending            |
| Dreadnought    | Pending                                                                                 | Pending                                 | Pending            |
| ColonyShip     | Pending                                                                                 | Pending                                 | Pending            |
| Recycler       | Pending                                                                                 | Pending                                 | Pending            |
| EspionageProbe | Pending                                                                                 | Pending                                 | Pending            |
| SolarSatellite | Pending; category-specific scale/propulsion brief                                       | Pending                                 | Pending            |

Ships do not all have pilots, the same physical size, or the same drives. Read the
actual rules and role before each brief. Combustion red, impulse blue and hyperspace
faint green are the agreed art convention. Drive upgrades exist in the engine:
choose whether art tracks the canonical baseline or effective propulsion before
shipping affected hulls. Do not recolor protected drive glow with a player's dye.
The first Light Fighter slice uses fixed red combustion glow.

Collection completion requires every applicable target to have an approved master,
validated package, working named dye choices, and verified in-game appearance.
Publishing a gallery of finished PNGs alone does not complete the collection.

## Decisions to close at the relevant stage

- Before W1 acceptance: package schema, renderer/map encoding versions, dimension
  and byte limits, compatible variant strategy, and measured mobile budget.
- Before W2/W4: implement agreed account ownership, independent empire/universe
  equipment and immutable recipe revisions; edits affect only the current universe.
  Define API/transaction details and retain referenced bakes consistently.
- Before W5 expansion: canonical collection design language/name; per-hull brief;
  drive-upgrade visual policy. Additional collections remain later work.
- Before first-slice emblem integration: freeze reviewed slot/treatment capabilities,
  immutable composition/art revisions and a static policy for any animated effects.
  Player colors remain their choice; optional outlines are separate future work.
- Before batch work: single-apply versus live empire-palette inheritance and
  historical appearance projection.
- Before W7 live use: currency authority/acquisition, real cost policy, failure
  charging, generation limits, cosmetic/prompt precedence and output governance.

These decisions do not block writing the workflow or generic local package work.
They must not be silently converted into settled product policy by later chats.

## Starting prompts for the next chats

**W1 — package tooling:** “Read this plan and the recolorable asset package
proposal. Preserve the accepted Concord finish result, make the compiler/renderer
asset-driven for ships/defenses/buildings, and deliver the validated v1 package
contract. Do not build generation billing or redesign the live shipyard.”

**One asset — repeated creative task:** “Use `$author-orbit-asset`. We are making
[target] in [collection]; here is my silhouette/finished reference. Follow the
offline authoring guide, iterate visually, and produce a reusable recolorable
package with primary/accent controls. Treat publication as a separate step.”

**W2–W4 — first slice:** “Read this plan and the frozen W1 contract. Deliver the
Light Fighter journey: Shipyard → Customize → owned dyes → save/equip → Shipyard
and fleet inventory → reload. Keep ordering intact and make the free path complete.
Use existing catalog/access rules; no generation API is needed.”

**W7 — generation design:** “Read the player-generated appearance track. Resolve
its listed product/data decisions, then design the generic job/provider and credit
contracts. Preserve permanent class-bound ownership and charge per generation,
not per equip or aesthetic approval. Do not assume failed-job refund policy.”
