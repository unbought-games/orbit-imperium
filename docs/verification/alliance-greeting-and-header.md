# Alliance greeting, header and notice footer

Validated locally on `3b97e6ffec92c372100e41bbdc6da5939f304c78` plus the
uncommitted changes in this task. No push, CI or deployment was requested.

- The Hall reads the viewer's authoritative profile and existing effective-title
  hook. Static component coverage checks address versus label, retained identity
  after profile observation expiry, and missing/expired title fallback.
- The shared alliance header always renders its artwork across Hall, Members,
  Applications, Roles, Settings and Audit. An application fixture journey checks
  actual navigation and loaded artwork on each tab.
- Notice help remains associated with the textarea and sits below the divider,
  top aligned beside Publish or Save. Component geometry checks cover both forms
  at 1440px and 390px, including horizontal overflow.

## Checks and evidence

Dependency preparation: pinned `npm ci --ignore-scripts`, about 3 seconds.

| Check | Result | Preparation | Execution |
| --- | --- | --- | --- |
| `npm test -- src/features/alliances/hall.test.ts src/client-model/empire-identity.test.ts` | 7 passed | Included | 629ms total |
| `ORBIT_TEST_SCREENSHOTS=1 npm run test:components -- alliance.component.spec.ts --workers=1` | 23 passed, 1 product-layout failure | 6087ms | 17.1s |
| Same component command with `-g 'notice help'` after CSS fix | 2 passed | 3832ms | 1.5s |
| `ORBIT_TEST_SCREENSHOTS=1 npm run test:ui -- alliances.spec.ts -g 'alliance image header' --workers=1` | 1 passed | 5521ms | 4.6s |
| Same application command with a calm mission fixture for unobscured captures | 1 passed | 4394ms | 3.4s |
| `npm exec -- tsc --noEmit -p apps/web` and `npm run test:component-types` | Passed | Not separately measured | Not separately measured |
| Focused ESLint, Prettier and `git diff --check` | Passed | Not separately measured | Not separately measured |

The first component run exposed a real mobile layout defect: Save wrapped below
Cancel, placing its top 35.59375px below the hint. Keeping the action group from
shrinking fixes the layout; the assertions were retained unchanged. This was a
product correction, not a flaky-test repair. The rerun covered both affected
viewport/form combinations. Existing bundle warnings about inconsistent JSON
import attributes did not fail compilation.

Browser suites and full typechecks ran serially after other observed browser
work finished. Local runner wait was not separately measured; no CI/merge queue
was involved. Fixture bundles and servers were cleaned up by the npm runner;
the task's development preview was also stopped.

Captured and inspected all six application tabs at 1440×1000 and 390×844, plus
publish/edit forms at 1440×1000 and 390×1000. Screenshots and labeled contact
sheets are delivered inline in the implementation chat, not hosted or attached
to a PR. Routine screenshot preparation is gated by `ORBIT_TEST_SCREENSHOTS=1`.
