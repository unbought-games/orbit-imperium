# Compact alliance members — 2026-11-10

Base revision: `141ad528` (the preceding Board redesign, committed at the owner's
request). This verification covers the uncommitted Members redesign above it.

## Changes and boundaries

- Replaced tall member cards and repeated heading/explanation with a semantic
  roster table. Desktop rows are 48px; mobile rows are 60px, with room to grow for
  long names. Role text moves below names on mobile; joined dates remain a
  desktop column. The activity guide is in the existing shared Popover.
- Derived leader-first/alphabetical order and concise role labels from current
  membership/role data; no new persisted game state or fabricated rank values.
- Moved role assignment and removal into a per-member menu. Roles open in a
  dialog, retaining submitted selections after rejection. Removal still needs
  confirmation. Existing permission and delegated-authority restrictions remain.
- Kept current alliance identity and insignia rendering in PlayerName.

## Validation

- `npm test -- src/features/alliances/roster-model.test.ts`: 2 passed, 167ms.
  Covers ordering without source mutation, concise/default/multiple role labels,
  and roles whose permissions or delegated grants exceed the actor's authority.
- `npm run test:components -- alliance.component.spec.ts --workers=1`: initial
  14-case run passed (3,861ms preparation, 8.9s execution). Adding explicit
  in-dialog rejected-save coverage produced 15 passing cases (3,842ms
  preparation, 9.3s execution).
- After mobile visual review shortened wrapping action labels to Cancel / Save
  roles, reran the five affected component cases with
  `-g 'role form delegates|locked member|compact member roster|rejected member-role'`.
  All five passed; preparation 3,856ms, execution 4.8s.
- `npm run test:ui -- alliances.spec.ts --workers=1`: 11 passed, 4,599ms bundle
  preparation and 14.3s execution. Existing application-level membership loss,
  profile affiliation, authority, routing and Board protection remain in place.
- Component/application TypeScript, focused ESLint, formatting and diff checks.
  No production build, database test suite, hosted CI or merge queue was run.

New component checks cover eight-member rosters and long names at 390px and
1440px, row density/no overflow, menu-to-dialog focus, role selections, removal
confirmation/cancel/submit, and omission of unauthorized activity/actions. Existing
role form tests were updated for the menu/dialog interaction; no tests were
removed or given retries/timeouts. All browser assertions passed on their first
runs. Initial static checks caught fixture literal types, an incomplete unit
fixture, and an unused import after extraction; those were corrected.

## Local preview and cleanup

The existing playground at port 55398 now contains seven additional fictional
players: nova, orion, kaia, atlas, lyra, vesper and ember. Player creation and
activity samples used the existing world CLI; joining, acceptance and role
assignment used normal authenticated local alliance commands. Sample joined dates
were backdated only for those seven synthetic memberships in the local database.
The original user, notices and equipped Starwing were retained. A later Recruiter selection for atlas was observed during the preview and
preserved.

The checked-in test scenario independently prepares its own varied roster. No
sample accounts or credentials were added to production source. Temporary local
seed scripts and dependency links were cleaned up; the development server and
populated playground remain available for review.

Captured and inspected the roster, action menu, role dialog and removal dialog
at 1440×1000 and 390×844. The mobile role-dialog buttons initially wrapped; shorter
labels fixed that and the captures were refreshed. The browser viewport was
restored, dialogs closed, and Members left selected. No local sample member was
removed during visual verification; removal behavior was exercised in the
isolated component tests.
