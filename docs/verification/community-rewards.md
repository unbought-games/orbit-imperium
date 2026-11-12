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

## Permanent version-3 composition rights

Actual cross-service acceptance exposed a product 403 on Save & equip after a
player permanently claimed both a dye and an emblem. The selected layer used the
owned dye while the recipe foreground retained a different free dye. Individual
item checks succeeded, but the final advanced-composition check still required
active membership.

The server now derives version-3 composition rights from free or permanently
granted elements after validating every selected dye, treatment, element and group.
Legacy version-2 composition rules remain enforced. The deterministic application
regression `permanent_elements_and_owned_dyes_include_required_v3_composition_rights`
covers the reported contrasting-color recipe, a granted stripe, rejection of
unowned elements/dyes/treatments, and fallback after observation expiry.

This follow-up was committed source-only under coordinated validation ownership.
Formatting and diff checks passed; the new regression has not yet been compiled
or executed. The currently built native executable is still from `e3a22bee`.
Focused application validation, a fresh native build and the retained real-service
save/equip acceptance must run before reporting this correction as validated.

## Qualified baseline and game-first invitation follow-up

The earlier source-only checkpoints above were subsequently qualified at
`3eaccbeeee7cff08f00cce6b689749ff6c089caf`: CI run `43126812953` passed all build,
unit, PostgreSQL and browser jobs. The composition correction and static SVG
stroke join support were included. No merge or deployment occurred.

The new frictionless invitation entry work supersedes that qualification and is
source-only. An earlier, unexecuted confirmation UI checkpoint was replaced after
the requested behavior changed; its confirmation cases are obsolete coverage,
not failed tests or renamed repairs.

- Public `/invite/<code>` resolves the current session despite anonymous embedded
  HTML. Anonymous users have one normal Play action; signed-in users proceed
  without waiting for optional preview or referral delivery. OAuth retains the
  code through the existing verified transaction. No alliance admission is implied.
- Canonical links remain game-scoped. Native alliance URLs and reward codes remain
  intact; safe known continuation paths survive authentication. Optional context
  can never make an invalid or unavailable invitation a game entry blocker.
- The entry coordinator persists one account-bound operation before dispatch,
  coalesces concurrent attempts, throttles/retries transient failure, clears
  terminal rejection, and ignores expired intent. Its request is independent of
  the game readiness state and can finish during ordinary navigation.
- Deterministic tests cover auth return safety, anonymous HTML versus fresh session,
  game/origin binding, public projection, retry identity across documents, account
  isolation, terminal/transient dispositions and expiry. Short browser cases cover
  the Play link, optional-context failure, automatic authenticated entry and
  in-game link creation. They do not recreate the retired mocked OAuth journey.

Focused tests, full static/build checks, desktop/mobile captures, new artifacts,
exact-revision CI and real-service signup/onboarding acceptance remain required.
Source formatting and generated contracts alone do not establish those outcomes.
