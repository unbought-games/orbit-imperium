# Automatic Renown titles

Implementation: `66aaeccd` adds optional `automatic_titles` to owner milestones
and the next-milestone projection, with automatic-title summaries separate from
cosmetic choices. The native bridge preserves these fields as JSON; delivery
stores permanent grants without changing the displayed identity.

## Focused validation

- Three focused client test files passed 12 tests. After a fixture-only unused
  variable correction, the four automatic-title tests passed again.
- Focused ESLint, Prettier, Rust formatting and whitespace checks passed.
- The coordinating validation owner reported
  `automatic_title_delivery_preserves_the_players_selected_title` passed in
  0.674s against isolated disposable PostgreSQL; the database was cleaned.

## Browser collection failure and repair

The first targeted browser attempt failed during module collection: Node 24
requires an import attribute for the JSON imported by
`apps/web/src/test-support/automatic-titles.ts`. No browser cases ran. Vitest's
bundled import handling had not exposed this Node-side fixture defect.

The validation owner supplied one precise repair: `with { type: 'json' }` on
that fixture import. This is the first fixture repair for the two new
`automatic Renown titles accompany cosmetic choices` cases. Preserve this history
if either case fails later; no retry result is claimed here.

The coordinating validation owner owns the targeted browser rerun, desktop/mobile
captures, full typecheck and build. These are pending in this record. No duplicate
browser run or shared-process restart was launched by the implementation lane.

## Compact roadmap follow-up

The validation owner reported both browser cases passed in 4.5s after the JSON
import repair and inspected desktop/mobile captures. The real arrival setup
failure was resolved by aligning the served client and API build; the explicitly
selected Captain title persisted normally.

Integration then supplied a 40-title roadmap. The UI now limits the default
summary to the latest unlocked and next locked milestone, with the full list
behind a closed disclosure. Each available cosmetic-choice milestone also shows
its automatic title inline. This is a product-scope correction, not another test
repair; the prior collection defect and its repair remain recorded above.

The deterministic 40-title case checks exactly two summary rows, closed disclosure
markup, retained full roadmap and claimed states, no mutation of source data,
and all-locked/all-unlocked boundaries. The existing two browser cases now check
the collapsed/expanded disclosure and inline title benefit; the coordinating
owner will rerun those affected cases and refresh their captures.

Final compact-roadmap validation at `3417fb5d` plus the then-pending approved
navigation cleanup: both targeted browser cases passed in 4.7s, and the production
web build/full app typecheck passed. Desktop/mobile actual-content captures were
inspected. Actual 19-to-20 Renown granted the title permanently; the separate
cosmetic claim and replay retained one award, receipt and native grant. The
player's deliberately selected Captain title and identity revision stayed
unchanged. The local API/client build was aligned before this walkthrough.
No production deployment or content publication was performed.
