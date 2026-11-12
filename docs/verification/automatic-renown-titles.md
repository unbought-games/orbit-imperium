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
