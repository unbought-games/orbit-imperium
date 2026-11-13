# Galaxy spy customization verification

Revision: `d2a283b432a84e832850f83f27ce2d61bb9f4f08` plus the uncommitted customization changes.

The new application journey covers planet keyboard activation and mobile moon activation, exact dispatch target/mission, editable probe count, and absence of an immediate launch. Deterministic mission-action tests cover eligible/ineligible planet and moon targets, protection, vacation, owned bodies and empty positions.

Initial focused browser run: preparation 4.384s; four existing navigation/restriction tests passed. The new planet case was interrupted after 28.5s waiting for the probe input. Evidence: `test-results/browser-ui/galaxy-cards-Spy-with-open-f7be4-t-espionage-draft-at-1280px/`. The fixture supplied probe inventory but no ship catalog, so Dispatch correctly rendered no ship input. This is a test-fixture defect, not a product regression. The moon case did not run. The new test has no prior repair history; the repair ledger and file history were checked. One explained repair adds the minimal probe catalog and an explicit visible-input assertion before editing. Existing simple navigation tests do not edit ships and do not need that catalog. Task-owned browser runner was interrupted and its preview cleaned up.

Final validation:

- `npm test -- apps/web/src/features/galaxy-mission-actions.test.ts apps/web/src/features/galaxy-body.test.ts apps/web/src/features/galaxy-position.test.ts`: 22 passed, 266ms.
- Focused existing browser cases: Transport/Attack navigation, beginner protection and vacation restrictions all passed in the first run above.
- `ORBIT_TEST_SCREENSHOTS=1 npm run test:ui -- galaxy-cards.spec.ts -g 'Spy with opens' --workers=1`: both new cases passed after the catalog repair (4.433s preparation, 5.0s runner). Visual inspection then prompted response-gating dispatch navigation before capture. The final run passed both cases (4.383s preparation, 5.4s runner; case execution 2.2s/2.4s). No runner queue wait; all test previews/browser processes cleaned up by the npm runner.
- `npx tsc --noEmit -p apps/web`: passed.
- Focused ESLint, Prettier checks, and `git diff --check`: passed. Separate static-check timings were not retained.
- Inspected the running Galaxy menus and destination drafts at 1280×900 and 390×900, including mobile moon targeting. Screenshots are local under `test-results/galaxy-spy-*`; dispatch captures use full-page height. No horizontal overflow. These are fixture frontend checks, not backend dispatch or production validation.
