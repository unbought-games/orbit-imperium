# Dispatch test migration

## Scope and status

Audited all **103 expanded cases** at base
`a119915ffaeb881a7f54d65542478f4788bd4210`. Phase one, commit
`5c3e04f9184c669740a6d597872f93d992952b76`, migrated/consolidated 20 and validated
83 remaining application cases. This follow-up moves the remaining component
contracts into the parent's shared component runner: **12 application cases and
72 component cases, covering the same 83 unique original titles**. One 320px
navigation scenario retains its layout assertions in both boundaries.

**The follow-up is not yet validated for integration.** After the collection fix,
the parent's first integrated component run executed all 72 Dispatch cases:
**66 passed, six failed**. This revision corrects the authored catalog and layout
fixtures responsible for those six failures; the entire Dispatch component group
still needs serial revalidation. Parent owns that browser/typecheck/build window. Register the
three scene entries below, validate the replacements, and capture the extracted
running UI before shipping the reduced application selection. No CI selection,
runner, shared harness fixture/registry/config, package manifest or changelog is
changed here. Previous passing runs below apply to phase one, not this follow-up.

Production extraction: `DispatchRequests` owns only request generations and review/
submission orchestration. It reads live resources through a port, emits UI updates,
and never duplicates coordinator state. `dispatch-reads.ts` owns cancellable advisory
reads and a pure source/key selector. React still owns edits, presentation, debounce,
focus, and subscriptions; the coordinator owns attempts and authoritative game state.

Phase two separates `DispatchView` from the session adapter in `missions.tsx` and
extracts reusable `DispatchCargoControls` / `DispatchFlightControls`. Existing
`DispatchDestinationPreview`, `MissionSelector`, `DispatchShips`, `DispatchTiming`
and `DispatchReview` remain real production components. Markup, CSS classes,
callbacks and draft invalidation behavior are preserved; no visual redesign is
intended. The isolated scene mounts the real `useDispatch` and `Coordinator` with
prepared source snapshots and typed in-memory `GamePort` responses. It does not
implement a substitute Dispatch controller or start auth/bootstrap/HTTP clients.

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
refer to the base file, not the shortened result. Component rows refer to the same named scenario in
`apps/web/tests/components/dispatch.spec.ts`; application rows remain in
`apps/web/tests/dispatch-validation.spec.ts`. Both destinations require parent
validation before integration. No case is skipped or assigned to an optional job.

| # | Original scenario (base line) | Disposition | Coverage and remaining browser contract |
| --- | --- | --- | --- |
| 1 | destination focus glow is desktop only (L12) | Component; first pass, shared-fixture revalidation pending | Same title in `components/dispatch.spec.ts`, using real feature controls/hook/model. DispatchDestinationPreview: native focused input border/shadow at 767/768/390; static markup cannot prove focus CSS. |
| 2 | owned-colony deploy launches with an edited historical draft (L292) | Application retained; pending revalidation | Report detail → historical draft → edited Deploy → authoritative quote → command; keeps report routing and actual launch wiring. |
| 3 | owned-colony deploy launches with manual coordinates (L292) | Consolidated | R1 manual/edited historical intent construction; original #2 historical launch and #8 manual successful submission retain the command/browser boundary. Viewport screenshots were diagnostic, not distinct assertions. |
| 4 | historical target identity changes still block review after editing away and back (L348) | Moved | R2 historical identity/owner recheck after editing away/back; #2 keeps historical-draft navigation and #29 keeps review-error rendering. |
| 5 | historical target owner changes still block review after editing away and back (L348) | Moved | R2 historical identity/owner recheck after editing away/back; #2 keeps historical-draft navigation and #29 keeps review-error rendering. |
| 6 | a historical body draft can switch to harvesting at the same coordinates (L378) | Moved | R3 historical body → debris intent; #39 keeps Harvest review controls and destination menu. |
| 7 | an edited historical deploy still reports authoritative quote rejection (L388) | Moved | R4 authoritative quote errors; #2 keeps historical Deploy entry and #29 keeps rejected-quote alert/no-confirmation rendering. |
| 8 | successful dispatch resets ship and cargo quantities after preserving edits through review (L404) | Application retained; pending revalidation | Review/back/edit/launch through real controls, committed reset, receipt placement, origin navigation. |
| 9 | editing a new draft clears the previous launch receipt (L457) | Application retained; pending revalidation | useDispatch + DispatchFeedback: editing a new draft removes the old receipt; R8 covers identity but not React event wiring. |
| 10 | dispatch shows submitting then Pending without false success (L478) | Application retained; pending revalidation | DispatchFeedback and shared action-status UI: submitting/pending/rejected/uncertain presentation, preserved inputs, retry recovery. Shared HUD owner must preserve Retry and focus before removing these. |
| 11 | dispatch shows submitting then Rejected without false success (L478) | Application retained; pending revalidation | DispatchFeedback and shared action-status UI: submitting/pending/rejected/uncertain presentation, preserved inputs, retry recovery. Shared HUD owner must preserve Retry and focus before removing these. |
| 12 | dispatch shows submitting then uncertain without false success (L478) | Application retained; pending revalidation | DispatchFeedback and shared action-status UI: submitting/pending/rejected/uncertain presentation, preserved inputs, retry recovery. Shared HUD owner must preserve Retry and focus before removing these. |
| 13 | a delayed successful launch does not erase edits for the next fleet (L583) | Moved | R8 synchronously tracked send and committed-only current-generation reset; #8 and #9 retain rendered reset and edit/receipt wiring. No browser held-command race is needed for promise order. |
| 14 | flight timing updates with speed and selected ships without opening review or sending fleets (L618) | Component; first pass, shared-fixture revalidation pending | Same title in `components/dispatch.spec.ts`, using real feature controls/hook/model. useDispatchTiming + form: speed keyboard interaction, estimate-request wiring, stable input position, clearing/reselecting ships. Duration arithmetic is already T1. |
| 15 | dispatch shows deployment arrival with speed and fuel below cargo at 320px (L677) | Component; first pass, shared-fixture revalidation pending | Same title in `components/dispatch.spec.ts`, using real feature controls/hook/model. DispatchTiming + speed/cargo layout: labels, fuel icon, control ordering, one-way arrival and empty-state geometry; includes moon/origin variation. |
| 16 | dispatch shows deployment arrival with speed and fuel below cargo at 390px (L677) | Component; first pass, shared-fixture revalidation pending | Same title in `components/dispatch.spec.ts`, using real feature controls/hook/model. DispatchTiming + speed/cargo layout: labels, fuel icon, control ordering, one-way arrival and empty-state geometry; includes moon/origin variation. |
| 17 | dispatch shows deployment arrival with speed and fuel below cargo at 1280px (L677) | Component; first pass, shared-fixture revalidation pending | Same title in `components/dispatch.spec.ts`, using real feature controls/hook/model. DispatchTiming + speed/cargo layout: labels, fuel icon, control ordering, one-way arrival and empty-state geometry; includes moon/origin variation. |
| 18 | deployment arrival clears while pending and ignores late or failed estimates (L727) | Moved | D1 explicit estimate completion/cancellation/error order; T1 pending/error markup omits timestamps; #15–17 retain deployment layout and rendered empty timing. |
| 19 | Add all fills the fleet capacity without opening review or consuming fuel reserves (L771) | Moved | R5 current-stock cargo fill with fuel reserve and no review output; C1 exact capacity/fuel allocation; #22 retains Add all/Max controls, #8 retains cargo submission. |
| 20 | an edited cargo amount wins over a delayed Add all response (L800) | Moved | R6 explicit edit-before-fill-completion for all/deuterium; #22 retains button-to-cargo wiring. Publication is fenced before cargo setters run. |
| 21 | an edited cargo amount wins over a delayed Max deuterium response (L800) | Moved | R6 explicit edit-before-fill-completion for all/deuterium; #22 retains button-to-cargo wiring. Publication is fenced before cargo setters run. |
| 22 | max deuterium keeps other cargo and Add all evenly fills the remaining space (L834) | Component; first pass, shared-fixture revalidation pending | Same title in `components/dispatch.spec.ts`, using real feature controls/hook/model. Cargo form: Max/Add all actual event handlers, preserved other edits and invalid-text alert. R5/C1 cover math; an interactive mount must retain wiring before removal. |
| 23 | Add all leaves invalid cargo untouched and explains the problem (L866) | Component; first pass, shared-fixture revalidation pending | Same title in `components/dispatch.spec.ts`, using real feature controls/hook/model. Cargo form: Max/Add all actual event handlers, preserved other edits and invalid-text alert. R5/C1 cover math; an interactive mount must retain wiring before removal. |
| 24 | mission changes preserve the observed destination and coordinate edits never reuse another target (L878) | Component; first pass, shared-fixture revalidation pending | Same title in `components/dispatch.spec.ts`, using real feature controls/hook/model. Mission/destination controls: observed identity retained for mission changes, cleared for different coordinates. D2/D3 and destination selectors cover evidence ordering. |
| 25 | cleared ship and cargo amounts display zero and submit as zero even before blur (L896) | Component; first pass, shared-fixture revalidation pending | Same title in `components/dispatch.spec.ts`, using real feature controls/hook/model. NumberInput + dispatch Form: empty normalization on blur and Enter submission before blur. V1 covers values; static render cannot replace native submit events. |
| 26 | pasting coordinates fills the unified field and preserves validation (L931) | Component; first pass, shared-fixture revalidation pending | Same title in `components/dispatch.spec.ts`, using real feature controls/hook/model. CoordinateInput + form: ClipboardEvent default prevention, aria-invalid/describedby, Review disabled, invalid draft suppresses reads. V1 covers input permutations; keep ARIA/interaction and geometry. |
| 27 | coordinate errors appear beside entry before review, including pasted emoji and ranges (L976) | Component; first pass, shared-fixture revalidation pending | Same title in `components/dispatch.spec.ts`, using real feature controls/hook/model. CoordinateInput + form: ClipboardEvent default prevention, aria-invalid/describedby, Review disabled, invalid draft suppresses reads. V1 covers input permutations; keep ARIA/interaction and geometry. |
| 28 | own-planet attack is actionable, while transport to another owned planet and own-position harvest stay available (L1044) | Component; first pass, shared-fixture revalidation pending | Same title in `components/dispatch.spec.ts`, using real feature controls/hook/model. Mission controls/Review: own hostile destination disabled, switching to allowed Transport/Harvest recovers; V1 and R7 cover policy. |
| 29 | protection is explained before review, rechecked at review, and launch races have readable receipts (L1075) | Application retained; pending revalidation | Advisory protection → authoritative quote rejection → newer valid review → rejected launch receipt, preserving draft. |
| 30 | fresh destination ownership is checked even when it was not in the owned-planet view (L1119) | Moved | R7 resolved ownership checked before FleetQuote; #28 retains own-target warning/action controls and #29 rejected-review rendering. |
| 31 | late eligibility and quote failures cannot overwrite an edited destination (L1153) | Moved | D2 cancelled old galaxy success/failure plus R6 old quote error fencing; #24 and #63 retain destination/origin edit wiring. |
| 32 | dispatch keeps coordinate editing inside one compact field at 320px (L1218) | Component; first pass, shared-fixture revalidation pending | Same title in `components/dispatch.spec.ts`, using real feature controls/hook/model. Dispatch form layout: coordinate field height/width, radio/touch dimensions, cargo action alignment, canonical resource colors, no overflow. |
| 33 | dispatch keeps coordinate editing inside one compact field at 390px (L1218) | Component; first pass, shared-fixture revalidation pending | Same title in `components/dispatch.spec.ts`, using real feature controls/hook/model. Dispatch form layout: coordinate field height/width, radio/touch dimensions, cargo action alignment, canonical resource colors, no overflow. |
| 34 | dispatch keeps coordinate editing inside one compact field at 1280px (L1218) | Component; first pass, shared-fixture revalidation pending | Same title in `components/dispatch.spec.ts`, using real feature controls/hook/model. Dispatch form layout: coordinate field height/width, radio/touch dimensions, cargo action alignment, canonical resource colors, no overflow. |
| 35 | review clearly identifies Attack, its route and conditional return (L1313) | Component; first pass, shared-fixture revalidation pending | Same title in `components/dispatch.spec.ts`, using real feature controls/hook/model. DispatchReview: mission semantics (M1/T1), initial focus/hit target, responsive overflow, back-button keyboard focus restoration; Harvest adds debris coordinate menu. Keep real browser layout/focus until mounted replacement exists. |
| 36 | review clearly identifies Transport, its route and conditional return (L1313) | Component; first pass, shared-fixture revalidation pending | Same title in `components/dispatch.spec.ts`, using real feature controls/hook/model. DispatchReview: mission semantics (M1/T1), initial focus/hit target, responsive overflow, back-button keyboard focus restoration; Harvest adds debris coordinate menu. Keep real browser layout/focus until mounted replacement exists. |
| 37 | review clearly identifies Deploy, its route and conditional return (L1313) | Component; first pass, shared-fixture revalidation pending | Same title in `components/dispatch.spec.ts`, using real feature controls/hook/model. DispatchReview: mission semantics (M1/T1), initial focus/hit target, responsive overflow, back-button keyboard focus restoration; Harvest adds debris coordinate menu. Keep real browser layout/focus until mounted replacement exists. |
| 38 | review clearly identifies Espionage, its route and conditional return (L1313) | Component; first pass, shared-fixture revalidation pending | Same title in `components/dispatch.spec.ts`, using real feature controls/hook/model. DispatchReview: mission semantics (M1/T1), initial focus/hit target, responsive overflow, back-button keyboard focus restoration; Harvest adds debris coordinate menu. Keep real browser layout/focus until mounted replacement exists. |
| 39 | review clearly identifies Harvest, its route and conditional return (L1313) | Component; first pass, shared-fixture revalidation pending | Same title in `components/dispatch.spec.ts`, using real feature controls/hook/model. DispatchReview: mission semantics (M1/T1), initial focus/hit target, responsive overflow, back-button keyboard focus restoration; Harvest adds debris coordinate menu. Keep real browser layout/focus until mounted replacement exists. |
| 40 | review clearly identifies Colonize, its route and conditional return (L1313) | Component; first pass, shared-fixture revalidation pending | Same title in `components/dispatch.spec.ts`, using real feature controls/hook/model. DispatchReview: mission semantics (M1/T1), initial focus/hit target, responsive overflow, back-button keyboard focus restoration; Harvest adds debris coordinate menu. Keep real browser layout/focus until mounted replacement exists. |
| 41 | review retains honest unknown identities and coordinate actions (L1412) | Component; first pass, shared-fixture revalidation pending | Same title in `components/dispatch.spec.ts`, using real feature controls/hook/model. DispatchReview + CoordinateLink: unknown identity, right-click menu, Escape dismissal/focus restoration. M1 alone cannot protect menu events. |
| 42 | historical review keeps observation context visible without flight details (L1436) | Component; first pass, shared-fixture revalidation pending | Same title in `components/dispatch.spec.ts`, using real feature controls/hook/model. DispatchReview: historical context remains visible without collapsed flight details; future static render can replace this, current browser remains selected. |
| 43 | dispatch review keeps each ship and count on its own row at 320px (L1452) | Application + component; component first pass, revalidation pending | Real Back-to-fleets navigation remains in the application; the same named mounted case retains row geometry/focus. DispatchReview/ShipComposition: row/name/count geometry, no overflow, back-to-edit focus and back-to-fleets route. Preserve one navigation assertion in the final gate when moving geometry. |
| 44 | dispatch review keeps each ship and count on its own row at 390px (L1452) | Component; first pass, shared-fixture revalidation pending | Same title in `components/dispatch.spec.ts`, using real feature controls/hook/model. DispatchReview/ShipComposition: row/name/count geometry, no overflow, back-to-edit focus and back-to-fleets route. Preserve one navigation assertion in the final gate when moving geometry. |
| 45 | dispatch review keeps each ship and count on its own row at 1280px (L1452) | Component; first pass, shared-fixture revalidation pending | Same title in `components/dispatch.spec.ts`, using real feature controls/hook/model. DispatchReview/ShipComposition: row/name/count geometry, no overflow, back-to-edit focus and back-to-fleets route. Preserve one navigation assertion in the final gate when moving geometry. |
| 46 | destination picker and coordinates converge on one preview at 320px (L1481) | Component; first pass, shared-fixture revalidation pending | Same title in `components/dispatch.spec.ts`, using real feature controls/hook/model. DispatchDestinationPreview + parent callbacks: selector/input convergence, mission switching, validation/empty states, popup and compact geometry. P1/D3 cover display/evidence only. |
| 47 | destination picker and coordinates converge on one preview at 390px (L1481) | Component; first pass, shared-fixture revalidation pending | Same title in `components/dispatch.spec.ts`, using real feature controls/hook/model. DispatchDestinationPreview + parent callbacks: selector/input convergence, mission switching, validation/empty states, popup and compact geometry. P1/D3 cover display/evidence only. |
| 48 | destination picker and coordinates converge on one preview at 1440px (L1481) | Component; first pass, shared-fixture revalidation pending | Same title in `components/dispatch.spec.ts`, using real feature controls/hook/model. DispatchDestinationPreview + parent callbacks: selector/input convergence, mission switching, validation/empty states, popup and compact geometry. P1/D3 cover display/evidence only. |
| 49 | late destination lookup cannot replace a selected colony and failures are honest (L1536) | Moved | D2 cancelled lookup success/failure cannot publish; P1 distinguishes unavailable/empty/loading and imagery; #46–48 retain selecting a colony and #51 live-preview updates. |
| 50 | destination picker includes a same-coordinate moon and excludes the origin (L1567) | Component; first pass, shared-fixture revalidation pending | Same title in `components/dispatch.spec.ts`, using real feature controls/hook/model. Destination selector: same-coordinate moon can be selected while the origin is excluded; destination selectors cover data, keep popup callback wiring. |
| 51 | planet renames, removal and origin changes update the picker and preview from live empire data (L1579) | Component; first pass, shared-fixture revalidation pending | Same title in `components/dispatch.spec.ts`, using real feature controls/hook/model. Live empire/preview connection: rename/removal/origin changes update available choices and keep typed coordinates; selectors cover pure identity but not subscription wiring. |
| 52 | selecting a planet invalidates an in-flight review for manual coordinates (L1614) | Moved | R6 cancellation during ResolveDestination prevents a quote request; #46–48 retain picker selection/review wiring and #63 origin invalidation wiring. |
| 53 | destination retains its last observation while refreshing the same system (L1640) | Moved | D3 compatible-read retention, D2 current observation delivery, P2 retained observation identity/image, destination identity selectors; #51 retains live refresh wiring. |
| 54 | a retained observation of a former colony is explicitly marked as historical (L1666) | Moved | Destination identity selector distinguishes current empire from retained observation; P2 asserts historical own identity, disabled empty picker, retained coordinates/art; D2 replaces the observation. #51 retains live empire removal wiring. |
| 55 | unified destination supports keyboard planet selection, dismissal and coordinate advancement (L1702) | Component; first pass, shared-fixture revalidation pending | Same title in `components/dispatch.spec.ts`, using real feature controls/hook/model. Native keyboard popup selection/dismissal and coordinate segment advancement. |
| 56 | ordinary coordinate entry defaults to Planet and Harvest keeps debris intent (L1727) | Component; first pass, shared-fixture revalidation pending | Same title in `components/dispatch.spec.ts`, using real feature controls/hook/model. CoordinateInput/Dispatch: ordinary Planet, Harvest debris, explicit Moon paste and segment edits preserve the selected kind through Review. D1 and timing selectors cover request construction. |
| 57 | explicit moon links retain their body intent through coordinate edits and review (L1743) | Component; first pass, shared-fixture revalidation pending | Same title in `components/dispatch.spec.ts`, using real feature controls/hook/model. CoordinateInput/Dispatch: ordinary Planet, Harvest debris, explicit Moon paste and segment edits preserve the selected kind through Review. D1 and timing selectors cover request construction. |
| 58 | long planet names remain readable in the narrow destination list (L1769) | Component; first pass, shared-fixture revalidation pending | Same title in `components/dispatch.spec.ts`, using real feature controls/hook/model. Long-name selector popup at 320px: clipping, title, preview height and document overflow require browser geometry. |
| 59 | choosing a planet clears a rejected paste notice without changing coordinate validation (L1788) | Component; first pass, shared-fixture revalidation pending | Same title in `components/dispatch.spec.ts`, using real feature controls/hook/model. Rejected foreign-link paste notice clears on picker selection; later range validation still produces the correct ARIA error. |
| 60 | background flight estimates preserve an explicit moon destination (L1810) | Moved | D1 estimates resolve explicit Moon with selected ships/speed and never request review terms; #57 retains pasted moon-link and subsequent edit/review integration. |
| 61 | dispatch feedback and ship selection at 390px (L1826) | Component; fixture repair pending validation | Same title in `components/dispatch.spec.ts`, using real feature controls/hook/model. Dispatch form: ship fill control, occupied/debris/deploy errors, advisory fuel warning and authoritative fuel rejection; R4/R7/C1/T1 cover domain rules, retain UI wiring. |
| 62 | dispatch feedback and ship selection at 1440px (L1826) | Component; fixture repair pending validation | Same title in `components/dispatch.spec.ts`, using real feature controls/hook/model. Dispatch form: ship fill control, occupied/debris/deploy errors, advisory fuel warning and authoritative fuel rejection; R4/R7/C1/T1 cover domain rules, retain UI wiring. |
| 63 | origin changes preserve destination and mission but discard origin-specific input and stale review (L1878) | Application retained; pending revalidation | Origin route change preserves mission/destination but clears origin edits and fences the old quote. |
| 64 | homeworld identity survives origin changes at 390px (L1908) | Component; first pass, shared-fixture revalidation pending | Same title in `components/dispatch.spec.ts`, using real feature controls/hook/model. Origin switch/homeworld label: destination identity model and P2 cover label source, retain current navigation/consumer wiring until consolidated with #63. |
| 65 | homeworld identity survives origin changes at 1440px (L1908) | Component; first pass, shared-fixture revalidation pending | Same title in `components/dispatch.spec.ts`, using real feature controls/hook/model. Origin switch/homeworld label: destination identity model and P2 cover label source, retain current navigation/consumer wiring until consolidated with #63. |
| 66 | espionage protection is observed before ships and remains advisory until review (L1919) | Component; first pass, shared-fixture revalidation pending | Same title in `components/dispatch.spec.ts`, using real feature controls/hook/model. No-ships espionage still shows advisory observation warning. V1 covers policy, interactive useDispatch wiring remains selected. |
| 67 | Dispatch shares a centered responsive content column with its review (L1928) | Application retained; pending revalidation | Dispatch and Review stay inside the shell responsive content column across actual breakpoints. |
| 68 | compact Dispatch identities, fleet slots and speed at 320px (L1972) | Component; first pass, shared-fixture revalidation pending | Same title in `components/dispatch.spec.ts`, using real feature controls/hook/model. Header/slots/help/Speed: geometry, native keyboard min/max and aria-valuetext, tooltip dismissal; T1 covers duration values. |
| 69 | compact Dispatch identities, fleet slots and speed at 390px (L1972) | Component; first pass, shared-fixture revalidation pending | Same title in `components/dispatch.spec.ts`, using real feature controls/hook/model. Header/slots/help/Speed: geometry, native keyboard min/max and aria-valuetext, tooltip dismissal; T1 covers duration values. |
| 70 | compact Dispatch identities, fleet slots and speed at 1440px (L1972) | Component; first pass, shared-fixture revalidation pending | Same title in `components/dispatch.spec.ts`, using real feature controls/hook/model. Header/slots/help/Speed: geometry, native keyboard min/max and aria-valuetext, tooltip dismissal; T1 covers duration values. |
| 71 | Origin shares the planet selector presentation at 390px (L2024) | Component; first pass, shared-fixture revalidation pending | Same title in `components/dispatch.spec.ts`, using real feature controls/hook/model. Origin and destination cards: matching artwork widths, loaded images, serif typography, popup interaction and overflow. Shared origin component owner participates. |
| 72 | Origin shares the planet selector presentation at 1440px (L2024) | Component; first pass, shared-fixture revalidation pending | Same title in `components/dispatch.spec.ts`, using real feature controls/hook/model. Origin and destination cards: matching artwork widths, loaded images, serif typography, popup interaction and overflow. Shared origin component owner participates. |
| 73 | mission choices are compact and keyboard accessible at 320px (L2053) | Component; first pass, shared-fixture revalidation pending | Same title in `components/dispatch.spec.ts`, using real feature controls/hook/model. Mission radio group: native ArrowRight selection/focus outline, one/two-row breakpoints, hit targets and single selection; not replaceable by a static selector. |
| 74 | mission choices are compact and keyboard accessible at 390px (L2053) | Component; first pass, shared-fixture revalidation pending | Same title in `components/dispatch.spec.ts`, using real feature controls/hook/model. Mission radio group: native ArrowRight selection/focus outline, one/two-row breakpoints, hit targets and single selection; not replaceable by a static selector. |
| 75 | mission choices are compact and keyboard accessible at 640px (L2053) | Component; first pass, shared-fixture revalidation pending | Same title in `components/dispatch.spec.ts`, using real feature controls/hook/model. Mission radio group: native ArrowRight selection/focus outline, one/two-row breakpoints, hit targets and single selection; not replaceable by a static selector. |
| 76 | mission choices are compact and keyboard accessible at 768px (L2053) | Component; first pass, shared-fixture revalidation pending | Same title in `components/dispatch.spec.ts`, using real feature controls/hook/model. Mission radio group: native ArrowRight selection/focus outline, one/two-row breakpoints, hit targets and single selection; not replaceable by a static selector. |
| 77 | mission choices are compact and keyboard accessible at 1440px (L2053) | Component; first pass, shared-fixture revalidation pending | Same title in `components/dispatch.spec.ts`, using real feature controls/hook/model. Mission radio group: native ArrowRight selection/focus outline, one/two-row breakpoints, hit targets and single selection; not replaceable by a static selector. |
| 78 | mission choices honor capabilities and retain a selected unavailable mission (L2108) | Component; first pass, shared-fixture revalidation pending | Same title in `components/dispatch.spec.ts`, using real feature controls/hook/model. Mission capabilities change live while selected unavailable mission is retained; needs real parent rerender with controlled store update. |
| 79 | ship fill actions share the cargo control and fill the fleet at 320px (L2123) | Component; first pass, shared-fixture revalidation pending | Same title in `components/dispatch.spec.ts`, using real feature controls/hook/model. DispatchShips: keyboard Max and Add All event wiring, current inventory/edited values, action alignment, no unintended quote/launch. Existing ship-selection tests cover counts. |
| 80 | ship fill actions share the cargo control and fill the fleet at 390px (L2123) | Component; first pass, shared-fixture revalidation pending | Same title in `components/dispatch.spec.ts`, using real feature controls/hook/model. DispatchShips: keyboard Max and Add All event wiring, current inventory/edited values, action alignment, no unintended quote/launch. Existing ship-selection tests cover counts. |
| 81 | ship fill actions share the cargo control and fill the fleet at 1440px (L2123) | Component; first pass, shared-fixture revalidation pending | Same title in `components/dispatch.spec.ts`, using real feature controls/hook/model. DispatchShips: keyboard Max and Add All event wiring, current inventory/edited values, action alignment, no unintended quote/launch. Existing ship-selection tests cover counts. |
| 82 | Add All reads current inventory and disables on an empty origin (L2191) | Component; first pass, shared-fixture revalidation pending | Same title in `components/dispatch.spec.ts`, using real feature controls/hook/model. DispatchShips: live very-large inventory update, empty origin disables fills, reversible empty disclosure. Ship-selection model covers exact values; keep UI controls. |
| 83 | Empire retains cargo wealth while launching and restores rejected reservations at 390px (L2221) | Application retained; pending revalidation | Empire/HUD wealth projection during pending and rejected launch, icon alignment and Empire navigation. Parent owns shared wealth/HUD coverage; no changes here. |
| 84 | Empire retains cargo wealth while launching and restores rejected reservations at 1440px (L2221) | Application retained; pending revalidation | Empire/HUD wealth projection during pending and rejected launch, icon alignment and Empire navigation. Parent owns shared wealth/HUD coverage; no changes here. |
| 85 | zero-padded Dispatch counts use canonical review and launch values at 390px (L2266) | Moved | R1 canonical padded manifest and R8 exact quote-to-command submission; V1 exact digit normalization. #8 retains actual launch/control wiring. Width variants had no geometry/focus assertions beyond diagnostic screenshots. |
| 86 | zero-padded Dispatch counts use canonical review and launch values at 1440px (L2266) | Moved | R1 canonical padded manifest and R8 exact quote-to-command submission; V1 exact digit normalization. #8 retains actual launch/control wiring. Width variants had no geometry/focus assertions beyond diagnostic screenshots. |
| 87 | zero-padded oversized ship counts retain server range rejection (L2299) | Moved | R9 oversized canonical quantity reaches quote unchanged and NumericRange publishes an actionable error with no quote; V1 exact counts beyond u64. This fixture never proved server range enforcement. |
| 88 | Dispatch keeps You in origin and review when self profiles and view names are unavailable (L2311) | Component; first pass, shared-fixture revalidation pending | Same title in `components/dispatch.spec.ts`, using real feature controls/hook/model. Origin/Review use You when self identity is unavailable. Does not recreate the retired reload/profile-navigation cases. Shared profile owner can mount these consumers. |
| 89 | Dispatch shows available ships with a reversible all-rows disclosure at 390px (L2325) | Component; fixture repair pending validation | Same title in `components/dispatch.spec.ts`, using real feature controls/hook/model. DispatchShips: Enter/Space disclosure, focus, aria-expanded, live inventory, empty origin and origin-local expansion. Existing one-repair history still applies; do not reset by migration. |
| 90 | Dispatch shows available ships with a reversible all-rows disclosure at 1440px (L2325) | Component; fixture repair pending validation | Same title in `components/dispatch.spec.ts`, using real feature controls/hook/model. DispatchShips: Enter/Space disclosure, focus, aria-expanded, live inventory, empty origin and origin-local expansion. Existing one-repair history still applies; do not reset by migration. |
| 91 | Dispatch retains unavailable edited rows until corrected without hiding a launch selection (L2381) | Component; first pass, shared-fixture revalidation pending | Same title in `components/dispatch.spec.ts`, using real feature controls/hook/model. DispatchShips: retain unavailable invalid/selected row until corrected; V1 and ship-selection cover values, retain real edit/disclosure interaction. |
| 92 | dispatch header keeps mission and editing controls together at 390px (L2404) | Component; first pass, shared-fixture revalidation pending | Same title in `components/dispatch.spec.ts`, using real feature controls/hook/model. Dispatch header/review: stable heading, route graphic, one/two-column layout, definition alignment, action placement and edit controls. |
| 93 | dispatch header keeps mission and editing controls together at 635px (L2404) | Component; fixture repair pending validation | Same title in `components/dispatch.spec.ts`, using real feature controls/hook/model. Dispatch header/review: stable heading, route graphic, one/two-column layout, definition alignment, action placement and edit controls. |
| 94 | dispatch header keeps mission and editing controls together at 1440px (L2404) | Component; fixture repair pending validation | Same title in `components/dispatch.spec.ts`, using real feature controls/hook/model. Dispatch header/review: stable heading, route graphic, one/two-column layout, definition alignment, action placement and edit controls. |
| 95 | dense dispatch review preserves full ship counts and cargo at 390px (L2458) | Component; first pass, shared-fixture revalidation pending | Same title in `components/dispatch.spec.ts`, using real feature controls/hook/model. Dense DispatchReview: full counts/resource names/icons, manifest alignment and overflow at 390/635/1440, editing preserves cargo; model exact arithmetic does not prove layout. |
| 96 | dense dispatch review preserves full ship counts and cargo at 635px (L2458) | Component; first pass, shared-fixture revalidation pending | Same title in `components/dispatch.spec.ts`, using real feature controls/hook/model. Dense DispatchReview: full counts/resource names/icons, manifest alignment and overflow at 390/635/1440, editing preserves cargo; model exact arithmetic does not prove layout. |
| 97 | dense dispatch review preserves full ship counts and cargo at 1440px (L2458) | Component; first pass, shared-fixture revalidation pending | Same title in `components/dispatch.spec.ts`, using real feature controls/hook/model. Dense DispatchReview: full counts/resource names/icons, manifest alignment and overflow at 390/635/1440, editing preserves cargo; model exact arithmetic does not prove layout. |
| 98 | background refresh retains compatible flight estimates and fresh Review at 1440px (L2513) | Component; first pass, shared-fixture revalidation pending | Same title in `components/dispatch.spec.ts`, using real feature controls/hook/model. Background refresh preserves focused enabled ship input and compatible timing/preview; explicit Review still asks fresh authority. D3/R10 cover data, native focus continuity remains browser-only. |
| 99 | background refresh retains compatible flight estimates and fresh Review at 390px (L2513) | Component; first pass, shared-fixture revalidation pending | Same title in `components/dispatch.spec.ts`, using real feature controls/hook/model. Background refresh preserves focused enabled ship input and compatible timing/preview; explicit Review still asks fresh authority. D3/R10 cover data, native focus continuity remains browser-only. |
| 100 | dispatch cargo capacity follows current estimates and edits at 390px (L2559) | Component; first pass, shared-fixture revalidation pending | Same title in `components/dispatch.spec.ts`, using real feature controls/hook/model. Cargo capacity display: pending/failed/invalid/full/over-capacity states, unchanged input position, controls and overflow. C1/D1 cover arithmetic/races, keep mounted state transitions. |
| 101 | dispatch debris preview reuses debris artwork at 390px (L2645) | Component; first pass, shared-fixture revalidation pending | Same title in `components/dispatch.spec.ts`, using real feature controls/hook/model. Debris preview loads actual artwork and retains it after missing-debris validation. P1 covers markup; browser verifies image loading and disabled Review. |
| 102 | dispatch cargo capacity follows current estimates and edits at 1440px (L2559) | Component; first pass, shared-fixture revalidation pending | Same title in `components/dispatch.spec.ts`, using real feature controls/hook/model. Cargo capacity display: pending/failed/invalid/full/over-capacity states, unchanged input position, controls and overflow. C1/D1 cover arithmetic/races, keep mounted state transitions. |
| 103 | dispatch debris preview reuses debris artwork at 1440px (L2645) | Component; first pass, shared-fixture revalidation pending | Same title in `components/dispatch.spec.ts`, using real feature controls/hook/model. Debris preview loads actual artwork and retains it after missing-debris validation. P1 covers markup; browser verifies image loading and disabled Review. |

## Component integration handoff

Parent owns `apps/web/tests/components/main.tsx`. Add these dynamic registrations
(the shared registry was deliberately not edited):

```ts
dispatch: async () => (await import('./dispatch')).DispatchScene,
'dispatch-historical': async () => (await import('./dispatch')).DispatchHistoricalScene,
'dispatch-unknown': async () => (await import('./dispatch')).DispatchUnknownScene,
```

Owned test files:

- `components/dispatch.tsx`: a feature-only scene with a minimal memory router for
  real link/menu semantics, prepared profiles, a real coordinator, and the actual
  Dispatch hook/view. There is no application router or authentication runtime.
- `components/dispatch-data.ts`: pure snapshot builders, options and constants shared
  by Node collection and browser scenes; runtime dependencies are pure test-support
  data modules only.
- `components/dispatch-fixture.ts`: browser-only coordinator and typed external world/view/command responses,
  complete production records, request capture and explicitly released read gates.
  Source updates use `Coordinator.refresh`; no game state is copied into a fake UI
  controller. Unexpected operations are recorded and asserted empty.
- `components/dispatch-driver.ts`: mount readiness, source updates, native control
  interaction, and explicit port-call inspection. It uses the shared `fixture.ts`.
- `components/dispatch.spec.ts`: 72 browser component cases. HTTP request observers
  become real coordinator-port inspection; native interaction, labels, geometry,
  loading/error and focus assertions remain. Optional screenshot calls and their
  preparation are removed from these contracts. Shared failure screenshots remain.

Seven application route/command cases remain (#2, #8, #9, #29, #43 at 320px,
#63, #67), plus five shared HUD/Empire receipt/wealth cases (#10–12, #83–84).
Parent may migrate those five with the shared HUD owner when equivalent coverage
passes. The background estimate/lookup races remain deterministic R/D tests;
component held reads cover visible loading/refresh behavior, not race permutations.
The self-profile reload cases retired by PR #359 remain retired. The moved ship
visibility cases #89/#90 retain their consumed repair history.

Run serially in the parent integration checkout with pinned Node 24.18.0:

1. `npm run test:component-types`, source TypeScript, focused lint/format.
2. `npm run test:components -- dispatch.spec.ts --workers=1` (72 cases).
3. `npm run test:ui -- dispatch-validation.spec.ts --workers=1` (12 cases).
4. Appropriate integrated build/checks and desktop/mobile visual refresh of the
   editor, review, fuel error and native controls. Include the existing HUD overlap
   and network-lifecycle concerns below in their shared owners' audit.

Do not interpret the phase-one 83-case pass as validation of this split. If the
component integration cannot be completed, keep the broader prior application
selection rather than shipping uncovered removals.

## Phase-two validation and repair record

- No browser, production build or full typecheck launched after the parent's
  resource-coordination instruction. New visual captures are intentionally pending
  that serial window; earlier images are historical evidence only.
- Source and component-file ESLint and Prettier checks are cheap local checks.
  ESLint initially found two aliases made unused by removing screenshot-only
  preparation; both were removed. Final focused ESLint (zero warnings), Prettier
  checks of the seven source/component files, and `git diff --check` passed.
- A registration-only inventory evaluated test declarations without running their
  bodies or opening browsers: 12 application + 72 component registrations, 83
  unique original titles, **zero missing** from the preceding 83-case inventory.
  Every original assertion contract has a named destination in the table.
- Two newly authored fixture smoke tests failed initialization with
  `ContractDataError: Invalid contract data` (0.568 s runner). Inspection found an
  invalid `reason: null` capability and absent per-body production records. The
  single repair corrected both. They failed again (0.340 s runner) because the
  minimal body lacked required baseline building-level keys. AJV diagnostic output
  identified all ten missing keys on each body; the fixture now includes them.
  Per the one-repair rule, those recurring authoring smoke tests were removed,
  not renamed or rerun. Names: `initializes the isolated scene through the real
  coordinator and validates its world/quote contracts` and `refreshes prepared
  source changes through the coordinator rather than a second UI state store`.
  They were never committed in the previous revision. Existing bootstrap/schema
  tests and the actual Coordinator's mandatory validation at every scene mount
  retain the contract invariant. The corrected scene remains pending parent
  component/type validation; no passing result is claimed for it.
- The temporary AJV inspection used existing pinned esbuild solely to load the
  fixture diagnostic (12 ms, 616.5 KB), not a production build or browser runner.
  Temporary files were removed. No application/server/container was started.

## Parent collection failure and scoped boundary repair

The parent's first Dispatch component attempt on the integrated phase-two code
(`669c3c74b3db37636d79ddb511f0eb715b8a52b7`) failed **during collection, with zero
tests executed**. Node could not resolve `ajv/dist/2020` through
`client-model/schema.ts`. This is a test-module boundary defect, not a browser
assertion failure, product regression, or proven infrastructure outage. At that point there were
no component/browser assertion results; the subsequent integrated run is recorded
below.

Cause: both the Node spec and its driver imported runtime constants from
`dispatch-fixture.ts`, which also imports the browser coordinator and schema
implementation. Merely collecting cases therefore loaded browser dependencies in
Node. The repair moves constants, options and snapshot builders into the pure
`dispatch-data.ts`; both Node files now import that module. Browser scene constants
also come from it, while the browser-only fixture retains Coordinator and ports.
The only remaining runtime importer of `dispatch-fixture.ts` is `dispatch.tsx`.
Type-only scene imports in the driver erase during transpilation. The shared data
module's runtime dependencies are the pure bootstrap/production test-support
builders. Production AJV imports, shared registry and runners are unchanged.

This is the first scoped repair of this collection boundary. The original failure
remains recorded; no expensive checks or browser retries were launched in this
chat. Parent owns full source/component typechecking and serial execution of the
72-case component group after integrating the fix. Focused formatting and a
runtime-import audit passed. The transpiled Node driver imports only the shared
Playwright fixture and `dispatch-data`; the pure data graph contains exactly
`dispatch-data.ts`, `test-support/bootstrap.ts`, and `test-support/production.ts`.
`git diff --check` also passed. These checks execute no test bodies and do not
establish a passing collection or browser result.

## First integrated component assertions: catalog and layout fixture repair

Parent evidence: `test-results/test-strategy/components-integrated/results.json`,
its per-case error contexts/screenshots/traces, and `/tmp/orbit-components-integrated.log`
in the parent checkout. The run began November 9, 2026 at 22:49:52 EST and used one
worker: **257 passed / 15 failed overall**, **66 passed / six failed in Dispatch**.
Preparation was 0.202 s; runner duration was 287.222 s; summed Dispatch execution
was 97.023 s. Allocation wait and outer shell/cleanup duration are not recorded.
The JSON does not embed an exact Git revision. At inspection the tested Dispatch
scene/data files matched local `93cd77b30b16bf8970af42cfbb0360dd08d85c26` byte-for-byte;
parent owns the full integrated revision record. No earlier failure is replaced by
these results, and this repair has not been executed in a browser yet.

The six original scenarios and failures:

| Original inventory | Scenario | Observed failure |
| --- | --- | --- |
| #61, #62 | `dispatch feedback and ship selection` at 390/1440px | Expected Espionage Probe, Small Cargo, Recycler, Colony Ship; got alphabetical Colony Ship, Espionage Probe, Recycler, Small Cargo. |
| #89, #90 | `Dispatch shows available ships with a reversible all-rows disclosure` at 390/1440px | Same incorrect civil-row order, before the disclosure interactions executed. |
| #93, #94 | `dispatch header keeps mission and editing controls together` at 635/1440px | Schedule top 463.1875 instead of manifest top 275.1875; wide Review remained stacked. |

These are two explained **authored-fixture defects**, not product regressions:

1. `dispatch-data.ts` incorrectly assigned the Small Cargo cost to every ship.
   `compareShips` correctly sorts by total catalog cost, then uses identity as its
   tie breaker. Restore the exact application fixture metadata: Espionage Probe
   `[0,1000,0]`, Small Cargo `[2000,2000,0]`, Recycler `[10000,6000,2000]`, Colony Ship
   `[10000,20000,10000]`; Light Fighter keeps its originally absent statistics.
   Catalog entry order itself is unchanged, preserving the quoted manifest order.
2. The scene's plain `main` lacked the production caller's query container.
   `game-shell.tsx` uses `ContentColumn` with `width="focused"` and the shared
   `work-area` class (`container-type: inline-size`). Review's two-column rule is
   `@container (min-width: 36rem)`, so viewport width alone never activated it.
   The scene now uses that actual ContentColumn and work-area class. There is no
   test-specific review CSS override and no production layout modification.

Inspected the 390px order and 635px stacked-review failure screenshots before
editing. Both entire spec files, all expected orders and geometry/focus assertions,
production ship sorting, and production CSS remain unchanged.

Shared-caller audit before this single repair:

- Reviewed later collapsed/expanded row assertions in #89/#90, including dynamic
  Light Fighter inventory, empty-origin presentation and focus/expansion reset.
  Restoring costs fixes both initial and expanded civil order; retaining absent
  Light Fighter metadata preserves the application fixture's legacy-catalog input.
- Reviewed #68–70 grouping, #79–82 fill/availability, #91 edited unavailable rows,
  and #43–45 / #95–97 manifest composition. All use the same catalog. Do not sort
  the fixture array to imitate expected UI order: original catalog order remains
  necessary for the quoted manifest, and the production comparator owns table order.
- Reviewed all six mission reviews (#35–40), ship-row geometry (#43–45), header
  controls (#92–94), and dense review (#95–97) for the restored container context.
  The 390px stack contract remains; 635/1440px retain side-by-side assertions.
- Reviewed cargo geometry/capacity (#32–34, #100/#102): `cargoFields` already owns
  its nearer inline-size container, so no replacement cargo breakpoint/CSS is added.
  Reusing ContentColumn also restores the caller's actual width caps at 768/1200/1600.

This is the one explained authored component-assertion repair batch requested by
the parent. Earlier setup/collection and retired smoke-test histories remain;
#89/#90's original setup repair is not erased or reset. Do not perform a second
stabilization or an unchanged retry if these tests fail after this repair. Classify
new evidence and apply the repository policy. Parent owns serial validation of the
whole Dispatch component group, since the corrected fixtures are shared by all 72.
Only focused formatting, diff checks and read-only evidence/source audits ran here;
no browser, production build, full typecheck, timeout change or retry was launched.

## Failure history and validation

Read `docs/runbooks/test-performance-audit.md` and Dispatch Git history before
migration. The November 6 setup repair removed an unrelated overview navigation;
#89/#90 retain that consumed repair history. The recurrent self-profile reload
scenarios were removed November 7 and are not recreated here. No retained browser
assertion has been loosened and no routine deadline, retry, or sleep was added.

Validation results and exact revision are recorded below before handoff.

### Phase-one local validation record (5c3e04f9)

Phase one tested base `a119915ffaeb881a7f54d65542478f4788bd4210` plus the
owned changes committed as `5c3e04f9184c669740a6d597872f93d992952b76`. These
results predate the phase-two presentation extraction and component split. Only local
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

### Phase-one visual validation (5c3e04f9)

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


## Integrated verification

The parent integrated this group and completed serial validation. See the
[combined verification record](test-strategy-overhaul.md) for final inventory,
passing runs, repairs, retained failures, visual evidence and cleanup. Earlier
“pending parent validation” entries above describe the historical handoff.
