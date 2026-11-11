# Community rewards verification

This change separates game evidence/ownership from remote account rewards. No
production operations or official catalog publication were performed.

## Coverage

- Application `community_rewards` tests distinguish successful strategy/progression
  inputs from presentation and scheduled events, bound retry spacing, and require
  the exact nonempty opening briefing definition before reporting completion.
- `cosmetic_catalog` tests cover independent dye/treatment ownership, expired remote
  observations, missing definitions, earned-only eligibility, typed renderer bounds
  and preservation of literal legacy colors.
- PostgreSQL `community_rewards` covers committed command/date recovery across
  midnight, replay, stale delivery leases, concurrent awards, all-source provenance,
  source-specific revocation and revoke-before-grant tombstones, unknown historical
  joins and callback intent binding. The tenure calculation has deterministic tests
  for continuous renamed intervals, delayed departure, gaps and same-clock rejoin.
  The whole multi-day social fixture was retired after two explained fixture defects;
  real-service alliance integration remains a coordinator-owned acceptance gate.
- Client tests cover schema boundaries, stable request identities, read/claim races,
  program navigation gating, named color selection, inaccessible retained IDs,
  treatment allowlists and bounded invitation recall.
- Fixture browser journeys cover route navigation, claim dialog focus and submission,
  celebration/error/inactive states and desktop/mobile layout. The named-editor
  journey was retired after invalid asset URLs and an over-exact select-label
  fixture. Deterministic recipe/controller coverage remains, with read-only saved
  design captures for visual review; actual save/equip authority belongs to real
  service acceptance. Gallery checks cover touch/focus and reduced motion.
- Isolated treatment rendering enumerates all supported surface/light/interaction
  patterns using independent free fixtures and the production renderer.

## Execution record

Initial affected Rust application tests passed (19 tests). The expanded application
and transport pass succeeded (33 tests), followed by a new stale-observation race
case (1 test). Selected package/all-target compile and strict Clippy passed before
the later recognition/rendering follow-ups; those follow-ups require the final run.

The first disposable database setup failed before tests because Docker's automatic
address pools were exhausted. A task-only explicit unused subnet resolved setup;
no other containers/networks were removed. The first migration run then exposed a
product syntax defect: `authorization` is reserved SQL. The unpublished migration
and queries were corrected to `award_payload` without changing the test.

At commit `21b4bd59`, the focused database suite passed: 3s setup, 4.59s compilation,
0.17s runner preparation, 1.854s execution (9s combined Make run). Its container,
volume and network were removed. Later source additions to that suite still need
execution. No test repair was consumed for the infrastructure or product failures.

The initial UI controller fixture omitted newly required milestone category/label
fields. The fixture was corrected from the owning schema; its three tests passed.
An earlier new test-file syntax typo prevented collection and was fixed. No
behavior assertion was weakened or removed. Existing affected client cases and
new focused contract/renderer cases passed; final source checks remain required.

Final full typechecks/builds, scheduled browser captures and image inspection,
actual Accounts/Orbit acceptance, migration/restart rehearsal, full catalog reader
validation and exact-revision CI are integration gates. Do not treat schema or
fixture success as completion of those gates.


The reward application journeys pass at desktop/mobile. The generic treatment
component gallery passes and its renders were inspected; square texture tiles,
full-surface highlights, mobile control width and public-honor padding were
corrected from captures. Prepared saved-design/alliance views were captured only
for visual review, not counted as interaction regression coverage. Temporary
capture cases are not retained in the routine browser suite.

Thin account observation batching has a real fixture HTTP test plus stale-generation
coverage. Profile reads use no full private owner response. Legacy title ownership
reconciliation was explicitly deferred; no extra ownership migration was added.
