# Alliance routing — 2026-11-13

Base revision: `d2a283b432a84e832850f83f27ce2d61bb9f4f08`, plus the
uncommitted implementation and tests in this worktree.

## Behavior and coverage

- Alliance Hall, Members, Applications, Roles, Settings and Audit now use
  TanStack file routes and the shared `routeTarget` helper. Each settings
  destination has a nested URL under `/alliance/settings/`.
- The parent route retains the workspace and authored drafts while its child
  route changes. Current page selection is derived from the URL and current
  permissions. No route selection is stored in component state.
- Selected directory profiles use the existing validated `alliance` search
  parameter. Selection and Back to alliances navigate through the router.
- Planetless entry points preserve the full subsection while canonicalizing to
  `/u/<universe>/b/<body>/alliance/...`. Unknown sections fail shared destination
  validation. Permission-aware navigation remains in place.
- Deterministic tests cover every section URL, matching/building with and without
  a body, section validation, permission fallback and draft workspace boundaries.
- One application journey covers direct settings entry, refresh, native
  Back/Forward, retained form edits, direct Audit entry and planetless subsection
  canonicalization. Existing directory and presentation journeys now protect
  selected-profile reload and leaving-workspace draft protection.
- The shared task header now wraps non-centered leading layouts on mobile,
  preventing Back and Create Alliance from crushing the discovery heading.
  The existing discovery journey asserts a readable heading and no horizontal
  page overflow at 390px.
- The route-independent settings component accepts navigation elements from its
  caller; isolated components retain coverage of forms, permission changes and
  independent draft/save scopes. Existing browser assertions were retained.

## Validation

All expensive checks were serialized in this chat. No hosted runner or merge
queue was used; runner queue wait and merge delay are not applicable.

| Check | Preparation | Execution | Result |
| --- | --- | --- | --- |
| Baseline author/roster browser inspection | 3.939s | 2.1s | 1 passed |
| Focused router, destination, navigation and section unit tests | Included in duration | 2.04s total | 35 passed |
| Alliances, recruitment and alliance identity application specs | 3.240s | 17.3s | 20 passed |
| Alliance component spec | 2.784s | 10.2s | 22 passed |
| Extended presentation journey and initial visual capture | 3.290s | 14.7s | Presentation passed; capture helper failed as described below |
| Corrected visual capture | 3.240s | 9.3s | Passed |
| Extended deep-link journey including planetless entry | 3.185s | 2.5s | Passed |
| Selected discovery profile capture | 3.134s | 1.3s | Passed |
| Mobile heading regression and refreshed capture | 2.997s | 2.9s | Capture passed; new heading locator failed as described below |
| Corrected mobile heading regression | 3.016s | 2.7s | Passed |

Commands: `npm test -- src/router.test.ts src/shell/routes.test.ts
src/features/alliances/navigation.test.ts src/features/alliances/sections.test.ts`,
`npm run test:ui -- alliances.spec.ts recruitment.spec.ts alliance-identity.spec.ts
--workers=1`, `npm run test:components -- alliance.component.spec.ts --workers=1`.
Focused follow-ups used the same npm browser runner with test-name filters.

Application TypeScript, `npm run test:component-types`, `npm run lint`, and
`git diff --check` passed. The full source Prettier check found one new route
file needing formatting; that file was formatted and its focused check passed.
No production release build or backend suite was needed for this routing-only
change. Dependencies were installed with `npm ci --ignore-scripts` (26s). The
host has Node 24.14.0/npm 11.9.0 rather than the manifest's 24.18.0/11.16.0;
installation warned about the versions, and the checks above passed on the host.

The temporary screenshot helper initially assumed Media had a Save presentation
button. Failure evidence and the existing editor show Media intentionally omits
that button. This was a capture-helper defect, with no prior repair history;
the repair ledger was checked. Its one correction waited for the shared Preview
public page control after membership, catalog and media responses completed.
The corrected capture passed. Evidence is retained at
`/tmp/orbit-alliance-routing-capture-failure`; the temporary capture helper was
removed after visual review. No product assertion was weakened or removed.

The new mobile geometry assertion initially matched both the shell h1 and
the visible task h2. After inspecting the failure, Git history and repair ledger,
its one correction scoped the locator to heading level 2; the full discovery
journey then passed. This was an introduced locator defect, not an intermittent
product failure. The ledger records an older restored-import correction in this
case, separately from the retired recruitment journey; it does not describe a
previous geometry-locator repair. Evidence is retained at
`/tmp/orbit-alliance-routing-heading-failure`. No assertions were removed.

## Visual review and cleanup

Captured and inspected Hall, Members, Applications, Roles, Audit, Identity,
Hall settings, Public page settings, Media, Recruitment, Invitations, Leadership,
Membership, selected discovery profile and the unsaved-presentation dialog at
1440×1000 and 390×844. Full-page images include below-fold content; review sheets
label each screen and viewport. Existing horizontal alliance navigation and
wrapping settings navigation are preserved. Capture artifacts remain in the
originating chat's local visualization directory, outside the repository.

The fixture runner closed its preview servers and browsers and removed temporary
bundles after each run. No shared service was stopped. No commits, push, PR,
deployment or production mutation was performed.
