# Dispatch test migration

## Scope and status

Audited all **103 expanded cases** in `apps/web/tests/dispatch-validation.spec.ts`
at base `a119915ffaeb881a7f54d65542478f4788bd4210` (Playwright `--list`, not a
count of source `test()` calls). This is a bounded migration, **not a completed
small application gate**. Twenty original cases are moved/consolidated; 83 remain
selected. Six retained cases are deliberate application-gate candidates. The
remaining cases protect component behavior or shared-owner integration and must
stay selected until the parent integrates and validates their component replacements.
No runner, shared fixture, CI selection, manifest, global guidance or changelog changed.

Production extraction: `DispatchRequests` owns only request generations and review/
submission orchestration. It reads live resources through a port, emits UI updates,
and never duplicates coordinator state. `dispatch-reads.ts` owns cancellable advisory
reads and a pure source/key selector. React still owns edits, presentation, debounce,
focus, and subscriptions; the coordinator owns attempts and authoritative game state.

## Replacement coverage key

Paths below are relative to `apps/web/src/`.

| Key | Passing protection (test names identify the concrete boundary) |
| --- | --- |
| R1 | `features/dispatch-requests.test.ts`: `reviews manual and edited historical deploys with canonical manifest` — blank/padded quantities, quoted cargo, owner, origin, ships. |
| R2 | Same: `rechecks historical identity after editing away and back` — identity and owner changes. |
| R3 | Same: `lets a historical body switch to harvesting without binding body identity to debris`. |
| R4 | Same: `communicates authoritative … without publishing a quote` — InvalidInput, BeginnerProtected, CargoCapacity; `distinguishes fuel shortages using a fresh fallback estimate and current origin amounts`. |
| R5 | Same: `fills … using current stocks, reserves fuel, and never opens review`; `preserves invalid cargo and surfaces the problem when Add all cannot fill it`. |
| R6 | Same: `an edited draft fences a delayed … completion` — resolve, quote, rejection, Add all, Max deuterium; `an old quote failure cannot clear a newer review busy state or overwrite its result`. Explicit deferred promises, no sleeps or fake-clock HTTP assumptions. |
| R7 | Same: `rejects newly resolved own attack targets before quoting even without local ownership evidence`; `rejects local validation before requesting destination`. |
| R8 | Same: `only a committed current submission resets the draft`; `tracks its synchronously registered submission while delivery is pending`; `does not clear a newer draft when a send is refused`. Tests both edited and untouched drafts and exact command/quote delivery. |
| R9 | Same: `preserves oversized canonical counts for authoritative NumericRange rejection`. |
| R10 | Same: `requests fresh authoritative terms even when a compatible advisory estimate exists`; private-site conflict refresh is separately tested. |
| D1 | `features/dispatch-reads.test.ts`: explicit Moon/speed/ships estimate, cancelled resolution/estimate/error cannot publish over newer result, failed estimates omit old terms, changed historical identity blocks estimation, private-site selection. |
| D2 | Same: `a cancelled galaxy … cannot replace the selected colony observation`; `a failed current observation clears old evidence instead of inventing an empty galaxy`. |
| D3 | Same: `compatible revision refreshes retain evidence, while changed inputs, model, and disabled reads hide it immediately`. |
| P1 | `features/dispatch-destination-preview.test.ts`: real component static rendering distinguishes loading/unavailable/empty/no imagery, incomplete coordinates, moon/debris labels/artwork. Static assertions make no focus/layout claims. |
| P2 | Same: `marks a retained former colony as historical, rather than current ownership`; `retains known observed identity and imagery while its compatible read refreshes`; live homeworld/moon labels. |
| V1 | Existing `client-model/dispatch-validation.test.ts`: coordinates/paste ranges, blank/invalid/padded/exact quantities, own targets, observation identity, error messages, mission restrictions and advisory protection. |
| C1 | Existing `client-model/dispatch-cargo.test.ts`: capacity/full/overflow/invalid/exact quantities, fuel reserve, current cargo preservation, balanced fill/Max resource behavior. |
| T1 | Existing `client-model/dispatch-timing.test.ts` and `features/dispatch-timing.test.ts`: fixed duration/schedule/mission selection and real static timing markup, including no timestamp for pending/empty/error. |
| M1 | Existing `features/dispatch-review-model.test.ts`: authoritative identity, unknown/unowned destinations, all six mission action labels, conditional return and exact large fleet counts. |

Existing `features/dispatch-destination.test.ts` covers current names, removed
colonies, source identity, same-coordinate moons, homeworld ID and different systems.
Existing `client-model/ship-selection.test.ts` covers large counts, empty/disabled
inventory, edited invalid rows, and visibility. These files were not modified.

## Complete original inventory

Numbers are stable positions from the original expanded inventory. Source lines
refer to the base file, not the shortened result. “Retain pending component” means
**still running in the existing suite**, not skipped or moved to an optional job.

| # | Original scenario (base line) | Disposition | Coverage and remaining browser contract |
| --- | --- | --- | --- |
| 1 | destination focus glow is desktop only (L12) | Retain pending component | DispatchDestinationPreview: native focused input border/shadow at 767/768/390; static markup cannot prove focus CSS. |
| 2 | owned-colony deploy launches with an edited historical draft (L292) | Gate candidate | Report detail → historical draft → edited Deploy → authoritative quote → command; keeps report routing and actual launch wiring. |
| 3 | owned-colony deploy launches with manual coordinates (L292) | Consolidated | R1 manual/edited historical intent construction; original #2 historical launch and #8 manual successful submission retain the command/browser boundary. Viewport screenshots were diagnostic, not distinct assertions. |
| 4 | historical target identity changes still block review after editing away and back (L348) | Moved | R2 historical identity/owner recheck after editing away/back; #2 keeps historical-draft navigation and #29 keeps review-error rendering. |
| 5 | historical target owner changes still block review after editing away and back (L348) | Moved | R2 historical identity/owner recheck after editing away/back; #2 keeps historical-draft navigation and #29 keeps review-error rendering. |
| 6 | a historical body draft can switch to harvesting at the same coordinates (L378) | Moved | R3 historical body → debris intent; #39 keeps Harvest review controls and destination menu. |
| 7 | an edited historical deploy still reports authoritative quote rejection (L388) | Moved | R4 authoritative quote errors; #2 keeps historical Deploy entry and #29 keeps rejected-quote alert/no-confirmation rendering. |
| 8 | successful dispatch resets ship and cargo quantities after preserving edits through review (L404) | Gate candidate | Review/back/edit/launch through real controls, committed reset, receipt placement, origin navigation. |
| 9 | editing a new draft clears the previous launch receipt (L457) | Retain pending component | useDispatch + DispatchFeedback: editing a new draft removes the old receipt; R8 covers identity but not React event wiring. |
| 10 | dispatch shows submitting then Pending without false success (L478) | Retain pending component | DispatchFeedback and shared action-status UI: submitting/pending/rejected/uncertain presentation, preserved inputs, retry recovery. Shared HUD owner must preserve Retry and focus before removing these. |
| 11 | dispatch shows submitting then Rejected without false success (L478) | Retain pending component | DispatchFeedback and shared action-status UI: submitting/pending/rejected/uncertain presentation, preserved inputs, retry recovery. Shared HUD owner must preserve Retry and focus before removing these. |
| 12 | dispatch shows submitting then uncertain without false success (L478) | Retain pending component | DispatchFeedback and shared action-status UI: submitting/pending/rejected/uncertain presentation, preserved inputs, retry recovery. Shared HUD owner must preserve Retry and focus before removing these. |
| 13 | a delayed successful launch does not erase edits for the next fleet (L583) | Moved | R8 synchronously tracked send and committed-only current-generation reset; #8 and #9 retain rendered reset and edit/receipt wiring. No browser held-command race is needed for promise order. |
| 14 | flight timing updates with speed and selected ships without opening review or sending fleets (L618) | Retain pending component | useDispatchTiming + form: speed keyboard interaction, estimate-request wiring, stable input position, clearing/reselecting ships. Duration arithmetic is already T1. |
| 15 | dispatch shows deployment arrival with speed and fuel below cargo at 320px (L677) | Retain pending component | DispatchTiming + speed/cargo layout: labels, fuel icon, control ordering, one-way arrival and empty-state geometry; includes moon/origin variation. |
| 16 | dispatch shows deployment arrival with speed and fuel below cargo at 390px (L677) | Retain pending component | DispatchTiming + speed/cargo layout: labels, fuel icon, control ordering, one-way arrival and empty-state geometry; includes moon/origin variation. |
| 17 | dispatch shows deployment arrival with speed and fuel below cargo at 1280px (L677) | Retain pending component | DispatchTiming + speed/cargo layout: labels, fuel icon, control ordering, one-way arrival and empty-state geometry; includes moon/origin variation. |
| 18 | deployment arrival clears while pending and ignores late or failed estimates (L727) | Moved | D1 explicit estimate completion/cancellation/error order; T1 pending/error markup omits timestamps; #15–17 retain deployment layout and rendered empty timing. |
| 19 | Add all fills the fleet capacity without opening review or consuming fuel reserves (L771) | Moved | R5 current-stock cargo fill with fuel reserve and no review output; C1 exact capacity/fuel allocation; #22 retains Add all/Max controls, #8 retains cargo submission. |
| 20 | an edited cargo amount wins over a delayed Add all response (L800) | Moved | R6 explicit edit-before-fill-completion for all/deuterium; #22 retains button-to-cargo wiring. Publication is fenced before cargo setters run. |
| 21 | an edited cargo amount wins over a delayed Max deuterium response (L800) | Moved | R6 explicit edit-before-fill-completion for all/deuterium; #22 retains button-to-cargo wiring. Publication is fenced before cargo setters run. |
| 22 | max deuterium keeps other cargo and Add all evenly fills the remaining space (L834) | Retain pending component | Cargo form: Max/Add all actual event handlers, preserved other edits and invalid-text alert. R5/C1 cover math; an interactive mount must retain wiring before removal. |
| 23 | Add all leaves invalid cargo untouched and explains the problem (L866) | Retain pending component | Cargo form: Max/Add all actual event handlers, preserved other edits and invalid-text alert. R5/C1 cover math; an interactive mount must retain wiring before removal. |
| 24 | mission changes preserve the observed destination and coordinate edits never reuse another target (L878) | Retain pending component | Mission/destination controls: observed identity retained for mission changes, cleared for different coordinates. D2/D3 and destination selectors cover evidence ordering. |
| 25 | cleared ship and cargo amounts display zero and submit as zero even before blur (L896) | Retain pending component | NumberInput + dispatch Form: empty normalization on blur and Enter submission before blur. V1 covers values; static render cannot replace native submit events. |
| 26 | pasting coordinates fills the unified field and preserves validation (L931) | Retain pending component | CoordinateInput + form: ClipboardEvent default prevention, aria-invalid/describedby, Review disabled, invalid draft suppresses reads. V1 covers input permutations; keep ARIA/interaction and geometry. |
| 27 | coordinate errors appear beside entry before review, including pasted emoji and ranges (L976) | Retain pending component | CoordinateInput + form: ClipboardEvent default prevention, aria-invalid/describedby, Review disabled, invalid draft suppresses reads. V1 covers input permutations; keep ARIA/interaction and geometry. |
| 28 | own-planet attack is actionable, while transport to another owned planet and own-position harvest stay available (L1044) | Retain pending component | Mission controls/Review: own hostile destination disabled, switching to allowed Transport/Harvest recovers; V1 and R7 cover policy. |
| 29 | protection is explained before review, rechecked at review, and launch races have readable receipts (L1075) | Gate candidate | Advisory protection → authoritative quote rejection → newer valid review → rejected launch receipt, preserving draft. |
| 30 | fresh destination ownership is checked even when it was not in the owned-planet view (L1119) | Moved | R7 resolved ownership checked before FleetQuote; #28 retains own-target warning/action controls and #29 rejected-review rendering. |
| 31 | late eligibility and quote failures cannot overwrite an edited destination (L1153) | Moved | D2 cancelled old galaxy success/failure plus R6 old quote error fencing; #24 and #63 retain destination/origin edit wiring. |
| 32 | dispatch keeps coordinate editing inside one compact field at 320px (L1218) | Retain pending component | Dispatch form layout: coordinate field height/width, radio/touch dimensions, cargo action alignment, canonical resource colors, no overflow. |
| 33 | dispatch keeps coordinate editing inside one compact field at 390px (L1218) | Retain pending component | Dispatch form layout: coordinate field height/width, radio/touch dimensions, cargo action alignment, canonical resource colors, no overflow. |
| 34 | dispatch keeps coordinate editing inside one compact field at 1280px (L1218) | Retain pending component | Dispatch form layout: coordinate field height/width, radio/touch dimensions, cargo action alignment, canonical resource colors, no overflow. |
| 35 | review clearly identifies Attack, its route and conditional return (L1313) | Retain pending component | DispatchReview: mission semantics (M1/T1), initial focus/hit target, responsive overflow, back-button keyboard focus restoration; Harvest adds debris coordinate menu. Keep real browser layout/focus until mounted replacement exists. |
| 36 | review clearly identifies Transport, its route and conditional return (L1313) | Retain pending component | DispatchReview: mission semantics (M1/T1), initial focus/hit target, responsive overflow, back-button keyboard focus restoration; Harvest adds debris coordinate menu. Keep real browser layout/focus until mounted replacement exists. |
| 37 | review clearly identifies Deploy, its route and conditional return (L1313) | Retain pending component | DispatchReview: mission semantics (M1/T1), initial focus/hit target, responsive overflow, back-button keyboard focus restoration; Harvest adds debris coordinate menu. Keep real browser layout/focus until mounted replacement exists. |
| 38 | review clearly identifies Espionage, its route and conditional return (L1313) | Retain pending component | DispatchReview: mission semantics (M1/T1), initial focus/hit target, responsive overflow, back-button keyboard focus restoration; Harvest adds debris coordinate menu. Keep real browser layout/focus until mounted replacement exists. |
| 39 | review clearly identifies Harvest, its route and conditional return (L1313) | Retain pending component | DispatchReview: mission semantics (M1/T1), initial focus/hit target, responsive overflow, back-button keyboard focus restoration; Harvest adds debris coordinate menu. Keep real browser layout/focus until mounted replacement exists. |
| 40 | review clearly identifies Colonize, its route and conditional return (L1313) | Retain pending component | DispatchReview: mission semantics (M1/T1), initial focus/hit target, responsive overflow, back-button keyboard focus restoration; Harvest adds debris coordinate menu. Keep real browser layout/focus until mounted replacement exists. |
| 41 | review retains honest unknown identities and coordinate actions (L1412) | Retain pending component | DispatchReview + CoordinateLink: unknown identity, right-click menu, Escape dismissal/focus restoration. M1 alone cannot protect menu events. |
| 42 | historical review keeps observation context visible without flight details (L1436) | Retain pending component | DispatchReview: historical context remains visible without collapsed flight details; future static render can replace this, current browser remains selected. |
| 43 | dispatch review keeps each ship and count on its own row at 320px (L1452) | Retain pending component | DispatchReview/ShipComposition: row/name/count geometry, no overflow, back-to-edit focus and back-to-fleets route. Preserve one navigation assertion in the final gate when moving geometry. |
| 44 | dispatch review keeps each ship and count on its own row at 390px (L1452) | Retain pending component | DispatchReview/ShipComposition: row/name/count geometry, no overflow, back-to-edit focus and back-to-fleets route. Preserve one navigation assertion in the final gate when moving geometry. |
| 45 | dispatch review keeps each ship and count on its own row at 1280px (L1452) | Retain pending component | DispatchReview/ShipComposition: row/name/count geometry, no overflow, back-to-edit focus and back-to-fleets route. Preserve one navigation assertion in the final gate when moving geometry. |
| 46 | destination picker and coordinates converge on one preview at 320px (L1481) | Retain pending component | DispatchDestinationPreview + parent callbacks: selector/input convergence, mission switching, validation/empty states, popup and compact geometry. P1/D3 cover display/evidence only. |
| 47 | destination picker and coordinates converge on one preview at 390px (L1481) | Retain pending component | DispatchDestinationPreview + parent callbacks: selector/input convergence, mission switching, validation/empty states, popup and compact geometry. P1/D3 cover display/evidence only. |
| 48 | destination picker and coordinates converge on one preview at 1440px (L1481) | Retain pending component | DispatchDestinationPreview + parent callbacks: selector/input convergence, mission switching, validation/empty states, popup and compact geometry. P1/D3 cover display/evidence only. |
| 49 | late destination lookup cannot replace a selected colony and failures are honest (L1536) | Moved | D2 cancelled lookup success/failure cannot publish; P1 distinguishes unavailable/empty/loading and imagery; #46–48 retain selecting a colony and #51 live-preview updates. |
| 50 | destination picker includes a same-coordinate moon and excludes the origin (L1567) | Retain pending component | Destination selector: same-coordinate moon can be selected while the origin is excluded; destination selectors cover data, keep popup callback wiring. |
| 51 | planet renames, removal and origin changes update the picker and preview from live empire data (L1579) | Retain pending component | Live empire/preview connection: rename/removal/origin changes update available choices and keep typed coordinates; selectors cover pure identity but not subscription wiring. |
| 52 | selecting a planet invalidates an in-flight review for manual coordinates (L1614) | Moved | R6 cancellation during ResolveDestination prevents a quote request; #46–48 retain picker selection/review wiring and #63 origin invalidation wiring. |
| 53 | destination retains its last observation while refreshing the same system (L1640) | Moved | D3 compatible-read retention, D2 current observation delivery, P2 retained observation identity/image, destination identity selectors; #51 retains live refresh wiring. |
| 54 | a retained observation of a former colony is explicitly marked as historical (L1666) | Moved | Destination identity selector distinguishes current empire from retained observation; P2 asserts historical own identity, disabled empty picker, retained coordinates/art; D2 replaces the observation. #51 retains live empire removal wiring. |
| 55 | unified destination supports keyboard planet selection, dismissal and coordinate advancement (L1702) | Gate candidate | Native keyboard popup selection/dismissal and coordinate segment advancement. |
| 56 | ordinary coordinate entry defaults to Planet and Harvest keeps debris intent (L1727) | Retain pending component | CoordinateInput/Dispatch: ordinary Planet, Harvest debris, explicit Moon paste and segment edits preserve the selected kind through Review. D1 and timing selectors cover request construction. |
| 57 | explicit moon links retain their body intent through coordinate edits and review (L1743) | Retain pending component | CoordinateInput/Dispatch: ordinary Planet, Harvest debris, explicit Moon paste and segment edits preserve the selected kind through Review. D1 and timing selectors cover request construction. |
| 58 | long planet names remain readable in the narrow destination list (L1769) | Retain pending component | Long-name selector popup at 320px: clipping, title, preview height and document overflow require browser geometry. |
| 59 | choosing a planet clears a rejected paste notice without changing coordinate validation (L1788) | Retain pending component | Rejected foreign-link paste notice clears on picker selection; later range validation still produces the correct ARIA error. |
| 60 | background flight estimates preserve an explicit moon destination (L1810) | Moved | D1 estimates resolve explicit Moon with selected ships/speed and never request review terms; #57 retains pasted moon-link and subsequent edit/review integration. |
| 61 | dispatch feedback and ship selection at 390px (L1826) | Retain pending component | Dispatch form: ship fill control, occupied/debris/deploy errors, advisory fuel warning and authoritative fuel rejection; R4/R7/C1/T1 cover domain rules, retain UI wiring. |
| 62 | dispatch feedback and ship selection at 1440px (L1826) | Retain pending component | Dispatch form: ship fill control, occupied/debris/deploy errors, advisory fuel warning and authoritative fuel rejection; R4/R7/C1/T1 cover domain rules, retain UI wiring. |
| 63 | origin changes preserve destination and mission but discard origin-specific input and stale review (L1878) | Gate candidate | Origin route change preserves mission/destination but clears origin edits and fences the old quote. |
| 64 | homeworld identity survives origin changes at 390px (L1908) | Retain pending component | Origin switch/homeworld label: destination identity model and P2 cover label source, retain current navigation/consumer wiring until consolidated with #63. |
| 65 | homeworld identity survives origin changes at 1440px (L1908) | Retain pending component | Origin switch/homeworld label: destination identity model and P2 cover label source, retain current navigation/consumer wiring until consolidated with #63. |
| 66 | espionage protection is observed before ships and remains advisory until review (L1919) | Retain pending component | No-ships espionage still shows advisory observation warning. V1 covers policy, interactive useDispatch wiring remains selected. |
| 67 | Dispatch shares a centered responsive content column with its review (L1928) | Gate candidate | Dispatch and Review stay inside the shell responsive content column across actual breakpoints. |
| 68 | compact Dispatch identities, fleet slots and speed at 320px (L1972) | Retain pending component | Header/slots/help/Speed: geometry, native keyboard min/max and aria-valuetext, tooltip dismissal; T1 covers duration values. |
| 69 | compact Dispatch identities, fleet slots and speed at 390px (L1972) | Retain pending component | Header/slots/help/Speed: geometry, native keyboard min/max and aria-valuetext, tooltip dismissal; T1 covers duration values. |
| 70 | compact Dispatch identities, fleet slots and speed at 1440px (L1972) | Retain pending component | Header/slots/help/Speed: geometry, native keyboard min/max and aria-valuetext, tooltip dismissal; T1 covers duration values. |
| 71 | Origin shares the planet selector presentation at 390px (L2024) | Retain pending component | Origin and destination cards: matching artwork widths, loaded images, serif typography, popup interaction and overflow. Shared origin component owner participates. |
| 72 | Origin shares the planet selector presentation at 1440px (L2024) | Retain pending component | Origin and destination cards: matching artwork widths, loaded images, serif typography, popup interaction and overflow. Shared origin component owner participates. |
| 73 | mission choices are compact and keyboard accessible at 320px (L2053) | Retain pending component | Mission radio group: native ArrowRight selection/focus outline, one/two-row breakpoints, hit targets and single selection; not replaceable by a static selector. |
| 74 | mission choices are compact and keyboard accessible at 390px (L2053) | Retain pending component | Mission radio group: native ArrowRight selection/focus outline, one/two-row breakpoints, hit targets and single selection; not replaceable by a static selector. |
| 75 | mission choices are compact and keyboard accessible at 640px (L2053) | Retain pending component | Mission radio group: native ArrowRight selection/focus outline, one/two-row breakpoints, hit targets and single selection; not replaceable by a static selector. |
| 76 | mission choices are compact and keyboard accessible at 768px (L2053) | Retain pending component | Mission radio group: native ArrowRight selection/focus outline, one/two-row breakpoints, hit targets and single selection; not replaceable by a static selector. |
| 77 | mission choices are compact and keyboard accessible at 1440px (L2053) | Retain pending component | Mission radio group: native ArrowRight selection/focus outline, one/two-row breakpoints, hit targets and single selection; not replaceable by a static selector. |
| 78 | mission choices honor capabilities and retain a selected unavailable mission (L2108) | Retain pending component | Mission capabilities change live while selected unavailable mission is retained; needs real parent rerender with controlled store update. |
| 79 | ship fill actions share the cargo control and fill the fleet at 320px (L2123) | Retain pending component | DispatchShips: keyboard Max and Add All event wiring, current inventory/edited values, action alignment, no unintended quote/launch. Existing ship-selection tests cover counts. |
| 80 | ship fill actions share the cargo control and fill the fleet at 390px (L2123) | Retain pending component | DispatchShips: keyboard Max and Add All event wiring, current inventory/edited values, action alignment, no unintended quote/launch. Existing ship-selection tests cover counts. |
| 81 | ship fill actions share the cargo control and fill the fleet at 1440px (L2123) | Retain pending component | DispatchShips: keyboard Max and Add All event wiring, current inventory/edited values, action alignment, no unintended quote/launch. Existing ship-selection tests cover counts. |
| 82 | Add All reads current inventory and disables on an empty origin (L2191) | Retain pending component | DispatchShips: live very-large inventory update, empty origin disables fills, reversible empty disclosure. Ship-selection model covers exact values; keep UI controls. |
| 83 | Empire retains cargo wealth while launching and restores rejected reservations at 390px (L2221) | Retain; shared owner | Empire/HUD wealth projection during pending and rejected launch, icon alignment and Empire navigation. Parent owns shared wealth/HUD coverage; no changes here. |
| 84 | Empire retains cargo wealth while launching and restores rejected reservations at 1440px (L2221) | Retain; shared owner | Empire/HUD wealth projection during pending and rejected launch, icon alignment and Empire navigation. Parent owns shared wealth/HUD coverage; no changes here. |
| 85 | zero-padded Dispatch counts use canonical review and launch values at 390px (L2266) | Moved | R1 canonical padded manifest and R8 exact quote-to-command submission; V1 exact digit normalization. #8 retains actual launch/control wiring. Width variants had no geometry/focus assertions beyond diagnostic screenshots. |
| 86 | zero-padded Dispatch counts use canonical review and launch values at 1440px (L2266) | Moved | R1 canonical padded manifest and R8 exact quote-to-command submission; V1 exact digit normalization. #8 retains actual launch/control wiring. Width variants had no geometry/focus assertions beyond diagnostic screenshots. |
| 87 | zero-padded oversized ship counts retain server range rejection (L2299) | Moved | R9 oversized canonical quantity reaches quote unchanged and NumericRange publishes an actionable error with no quote; V1 exact counts beyond u64. This fixture never proved server range enforcement. |
| 88 | Dispatch keeps You in origin and review when self profiles and view names are unavailable (L2311) | Retain pending component | Origin/Review use You when self identity is unavailable. Does not recreate the retired reload/profile-navigation cases. Shared profile owner can mount these consumers. |
| 89 | Dispatch shows available ships with a reversible all-rows disclosure at 390px (L2325) | Retain pending component | DispatchShips: Enter/Space disclosure, focus, aria-expanded, live inventory, empty origin and origin-local expansion. Existing one-repair history still applies; do not reset by migration. |
| 90 | Dispatch shows available ships with a reversible all-rows disclosure at 1440px (L2325) | Retain pending component | DispatchShips: Enter/Space disclosure, focus, aria-expanded, live inventory, empty origin and origin-local expansion. Existing one-repair history still applies; do not reset by migration. |
| 91 | Dispatch retains unavailable edited rows until corrected without hiding a launch selection (L2381) | Retain pending component | DispatchShips: retain unavailable invalid/selected row until corrected; V1 and ship-selection cover values, retain real edit/disclosure interaction. |
| 92 | dispatch header keeps mission and editing controls together at 390px (L2404) | Retain pending component | Dispatch header/review: stable heading, route graphic, one/two-column layout, definition alignment, action placement and edit controls. |
| 93 | dispatch header keeps mission and editing controls together at 635px (L2404) | Retain pending component | Dispatch header/review: stable heading, route graphic, one/two-column layout, definition alignment, action placement and edit controls. |
| 94 | dispatch header keeps mission and editing controls together at 1440px (L2404) | Retain pending component | Dispatch header/review: stable heading, route graphic, one/two-column layout, definition alignment, action placement and edit controls. |
| 95 | dense dispatch review preserves full ship counts and cargo at 390px (L2458) | Retain pending component | Dense DispatchReview: full counts/resource names/icons, manifest alignment and overflow at 390/635/1440, editing preserves cargo; model exact arithmetic does not prove layout. |
| 96 | dense dispatch review preserves full ship counts and cargo at 635px (L2458) | Retain pending component | Dense DispatchReview: full counts/resource names/icons, manifest alignment and overflow at 390/635/1440, editing preserves cargo; model exact arithmetic does not prove layout. |
| 97 | dense dispatch review preserves full ship counts and cargo at 1440px (L2458) | Retain pending component | Dense DispatchReview: full counts/resource names/icons, manifest alignment and overflow at 390/635/1440, editing preserves cargo; model exact arithmetic does not prove layout. |
| 98 | background refresh retains compatible flight estimates and fresh Review at 1440px (L2513) | Retain pending component | Background refresh preserves focused enabled ship input and compatible timing/preview; explicit Review still asks fresh authority. D3/R10 cover data, native focus continuity remains browser-only. |
| 99 | background refresh retains compatible flight estimates and fresh Review at 390px (L2513) | Retain pending component | Background refresh preserves focused enabled ship input and compatible timing/preview; explicit Review still asks fresh authority. D3/R10 cover data, native focus continuity remains browser-only. |
| 100 | dispatch cargo capacity follows current estimates and edits at 390px (L2559) | Retain pending component | Cargo capacity display: pending/failed/invalid/full/over-capacity states, unchanged input position, controls and overflow. C1/D1 cover arithmetic/races, keep mounted state transitions. |
| 101 | dispatch debris preview reuses debris artwork at 390px (L2645) | Retain pending component | Debris preview loads actual artwork and retains it after missing-debris validation. P1 covers markup; browser verifies image loading and disabled Review. |
| 102 | dispatch cargo capacity follows current estimates and edits at 1440px (L2559) | Retain pending component | Cargo capacity display: pending/failed/invalid/full/over-capacity states, unchanged input position, controls and overflow. C1/D1 cover arithmetic/races, keep mounted state transitions. |
| 103 | dispatch debris preview reuses debris artwork at 1440px (L2645) | Retain pending component | Debris preview loads actual artwork and retains it after missing-debris validation. P1 covers markup; browser verifies image loading and disabled Review. |

## Component integration handoff

The parent owns the shared test-only Vite/Playwright harness. Extend that harness;
do not introduce another application bootstrapping harness. The smallest useful
mounts are the actual `DispatchShips`, `DispatchDestinationPreview`,
`DispatchTiming`, `DispatchReview`, and a controlled `useDispatch` form consumer.
Use real callbacks/providers and prepared coordinator state. Inject promises at
world/send ports for asynchronous transitions; keep arithmetic and completion
permutations in R/D tests. Keep native focus, keyboard, ClipboardEvent, hit targets,
popup dismissal, image delivery and geometry in the mounted browser tests.

After component replacements pass, the parent can reduce application selection to
the six candidates above and preserve one back-to-fleets navigation assertion from
#43–45. No row marked pending has been silently deselected. Shared HUD/Empire rows
#10–12/#83–84 and shared profile consumer #88 require their owner's integration.
The identity reload scenarios retired by PR #359 remain retired.

## Failure history and validation

Read `docs/runbooks/test-performance-audit.md` and Dispatch Git history before
migration. The November 6 setup repair removed an unrelated overview navigation;
#89/#90 retain that consumed repair history. The recurrent self-profile reload
scenarios were removed November 7 and are not recreated here. No retained browser
assertion has been loosened and no routine deadline, retry, or sleep was added.

Validation results and exact revision are recorded below before handoff.

### Local validation record

Tested base `a119915ffaeb881a7f54d65542478f4788bd4210` plus the owned source/test
changes in this implementation commit. The originating chat reports the final
commit SHA; no source changes follow the final visual validation. Only local
commits are authorized here; CI, queue wait and merge delay are not applicable.

- Final environment: Node **24.18.0**, npm **11.16.0**, existing pinned dependency
  installation linked locally from the parent worktree. Initial exploratory runs
  used the host default Node 23.3.0; final validation below used the pinned tools.
- Focused client command: `npm test -- src/features/dispatch-requests.test.ts
  src/features/dispatch-reads.test.ts src/features/dispatch-destination-preview.test.ts
  src/features/dispatch-destination.test.ts src/features/dispatch-review-model.test.ts
  src/features/dispatch-timing.test.ts src/client-model/dispatch-validation.test.ts
  src/client-model/dispatch-timing.test.ts src/client-model/dispatch-cargo.test.ts
  src/client-model/ship-selection.test.ts` — **213 passed in 10 files**, 9.63 s
  runner duration under concurrent host load. Includes 53 new controller/read/render
  cases. Vitest reports transform/import/execution percentages, not separate
  scheduler allocation; external runner wait is unavailable.
- `tsc --noEmit -p apps/web` passed. Focused ESLint (`--max-warnings 0`), Prettier
  checks for all eight changed/new source files, and `git diff --check` passed.
  No global formatting or dependency updates were made.
- `npm run test:ui -- dispatch-validation.spec.ts --workers=1` — **83 passed,
  zero skipped, zero unexpected, zero flaky**, first retained-file run. Vite
  preparation **14.560 s**, summed test execution **399.875 s**, Playwright
  runner **407.144 s** (2026-11-09 21:16:09–21:22:56 America/New_York). Preparation
  plus runner is **421.704 s**; shell startup/cleanup overhead was not separately
  measured. Machine contention prevents attributing this timing to test changes
  alone. The full application browser suite belongs to the parent and was not run.
- Preserve the browser JSON in local `test-results/dispatch-retained-results.json`.
  Three Vite proxy logs appeared during the passing run: player-profiles at
  21:18:33, world at 21:18:58, world at 21:21:03 (America/New_York), all
  `ECONNREFUSED 127.0.0.1:8080`. The shared fixture already intercepts these API
  paths; the exact late-request lifecycle is not established by these logs.
  These are **not assertion failures or proven external infrastructure incidents**.
  Parent owns the shared unexpected-network/lifecycle audit and must carry this
  evidence into it. A passing run does not close that unresolved fixture concern.
- New-test authoring failure: the CargoCapacity expected-message regex used
  “cargo space” while production says “cannot carry this cargo and fuel.” Two
  invocations issued before its repair reported the same deterministic mismatch;
  one correction asserted the actual actionable text. Subsequent focused runs
  passed. No prior browser repair budget was reset. Type checking also caught a
  missing `DispatchSubmission` import and incomplete typed preview fixtures;
  both were corrected before the final successful type check.
- Regression demonstration: temporarily removed only the post-quote current-generation
  guard. `npm test -- src/features/dispatch-requests.test.ts -t 'an edited draft
  fences a delayed quote completion'` failed because the stale quote published.
  Restored the byte-identical source in `finally`; the same single test passed
  (1.02 s). This was an intentional fault check, not an unchanged reliability retry.
- All browser runners close their own Vite server, Chromium context and reserved
  port in the existing runner cleanup. No database, backend, containers or shared
  application services were started or stopped. The worktree and ignored screenshot
  artifacts remain available for parent integration; no push/PR/merge occurred.

### Visual validation

Before extraction, the manual Deploy journey passed on the base source (one case,
5.019 s Vite preparation, 5.3 s runner); inspected its 390×900 and 1440×900 Review
captures. After extraction, `ORBIT_TEST_SCREENSHOTS=1 npm run test:ui --
dispatch-validation.spec.ts --workers=1 -g 'dispatch feedback and ship selection|owned-colony deploy launches'`
passed **3 cases**, 20.406 s preparation and 30.088 s runner. This extra run was
for final visual inspection, not an unchanged reliability retry.

Inspected final local captures (all in `test-results/`, not tracked or hosted):

- `dispatch-ready-390x1000.png` — editor, 390×1000 viewport.
- `dispatch-ready-1440x1000.png` — editor, 1440×1000 viewport, full page.
- `dispatch-review-390x1000.png` — Transport Review, 390×1000 viewport.
- `dispatch-review-1440x1000.png` — Transport Review, 1440×1000 viewport.
- `dispatch-fuel-390x1000.png` — fuel rejection, 390×1000 viewport.
- `dispatch-fuel-1440x1000.png` — fuel rejection, 1440×1000 viewport, full page.

The Dispatch presentation and resource icons remain consistent across the
refactor. **Existing shared HUD overlap remains:** the mobile editor orb covers
part of the right-side ship controls, and the fuel-error capture overlaps the
Review button's lower-right area. The pre-refactor 390×900 Deploy capture also
shows orb/action overlap. Parent owns HUD production/layout work; this task does
not change those shared files or claim that overlap is fixed. Carry the captures
into that owner's component/hit-target audit. The originating chat displays the
final images inline.
