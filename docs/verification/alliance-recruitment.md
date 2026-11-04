# Alliance invitations and recruitment validation

Implemented November 4, 2026, in `emick/alliance-recruitment`. This is local
implementation and validation, not a PR, merge, deployment or production signup.
Scope follows the owner's discussion: alliance-owned links under
ManageRecruitment, optional discovery/preferences, ordinary enrollment and
joining rules, and one share image. Personal invitations/friend requests and
referral entitlements are deferred. Existing work homes: issues #201 and #202.

## Tested source

Base revision: `a4b2dcab0847182244c0afae1f5783c6a9a27b33`.
The implementation is an uncommitted worktree diff. Initial implementation code/test/config
fingerprint: `38a35eb05def977ad0736bed2c88a286d1b0bf82cd39de5d2c152307c16802bf`.
This SHA-256 hashes sorted modified/untracked, nonignored paths outside `docs/`,
each as UTF-8 path, NUL, exact file bytes, NUL. The local manifest is
`test-results/recruitment-source-fingerprint.json`.

## Verification

| Check | Result | Recorded preparation / execution |
| --- | --- | --- |
| `npm test` | 1,335 tests passed | Final runner duration 4.14 s |
| `cargo nextest run -p orbit-engine -p orbit-application -p orbit-transport-http` | 656 tests passed | Warm compilation 3.98 s; execution 29.811 s |
| `make _db-alliances` | 10 tests passed, serial, disposable PostgreSQL database | Final compilation 4.98 s; execution 32.745 s |
| `npm run test:ui -- recruitment.spec.ts alliances.spec.ts` | 18 fixture browser tests passed | Vite preparation 1.704 s; Playwright 9.9 s |
| Focused management rerun after spacing/touch-target polish | Both viewport cases passed | Playwright 2.8 s |
| `npm run build` | Passed, including TypeScript and homepage prerender | Vite reports build/prerender phases in local log |
| ESLint, Prettier, Rust format, contracts, boundaries | Passed | Native check outputs retained locally |
| Clippy on engine/application/HTTP/PostgreSQL, all targets, test-support, `-D warnings` | Passed | Final warm check 3.59 s |

Full initial cold setup and cumulative end-to-end wall time were not instrumented.
The first database compilation reported 40.09 s. There was no remote runner wait,
merge queue, queue removal or merge delay. Existing Vite bundle-size notices remain;
no functional check was waived because of them.

The PostgreSQL/HTTP coverage checks opt-in filtering, unknown preferences,
recruitment modes, current-epoch lookup, permissions, atomic link rotation,
receipt replay, existing membership/application constraints, public projections,
anonymous HTML, no-store responses, PNG delivery and revoked-link responses.
Public queries explicitly select public columns rather than loading private
noticeboard/role/audit JSON into directory rows.

## Browser and visual review

The real React interface ran in Chromium with controlled HTTP fixtures. These
fixtures simulate authentication delivery; a production Accounts signup was not
performed. Native HTTP/database tests cover the server endpoints separately.

Desktop: 1440 × 900. Mobile: 390 × 900. Captures are local, under `test-results/`,
with `recruitment-{screen/state}-{width}x900.png` names. Long pages use full-page
captures at those viewport dimensions; homepage entry captures show the community
section in the viewport. The share image is 1200 × 630.

Inspected invitation, enrollment, welcome/application, pending application,
open-join confirmation, public directory, empty search, universe picker, in-game
discovery, recruitment settings, invalidated invitation and homepage entry.
The manual interaction also completed application submission, open joining,
existing-account admission without duplicate enrollment, and Start playing to
the overview. Language and activity controls, opt-out, invitation creation and
disabling were exercised in retained browser tests. Screenshots are delivered
inline in the originating implementation chat, not hosted in a PR.

## Failure and repair ledger

History and `docs/runbooks/test-performance-audit.md` were inspected. No separate
owner Test Czar ledger was available in this checkout. This is the local record.

- Initial browser preparation failed because this fresh worktree had no npm
  dependencies. `npm ci` resolved setup; the unchanged baseline public-page test
  then passed and its desktop/mobile screenshots were inspected before UI edits.
- The first domain run failed because the new fixture attempted to create the
  already-existing default role named Recruiter. Both new callers were audited
  and use a distinct test role. The repaired tests pass; policy assertions remain.
- Two database tests independently expected the old two-field public DTO. Both
  assertions now check the exact four-field allowlist (summary, public_text,
  universe_name, enrollment_open); private-field checks remain. Each failed once
  before its repair. All tests in the suite now pass.
- Initial browser invitation/application and existing-player joining scenarios
  failed because the game shell dropped the welcome and invitation search values
  while canonicalizing the selected planet. Those values are now preserved.
- Their next run still failed because TanStack parses `welcome=1` as numeric 1.
  The parser now accepts the actual decoded value and normalizes it. Following
  the one-repair rule, both new scenario definitions (four desktop/mobile cases)
  were deleted, not renamed or retried. URL parsing/canonicalization protection
  is retained in deterministic `recruitment.test.ts`, including the actual router
  parser/stringifier; enrollment and joining rules remain covered in HTTP/domain/
  database tests. The complete UI journeys were subsequently exercised manually
  and captured, not reintroduced as replacement automated browser tests.
- Three browser cases were interrupted while waiting for exact labels on wrapped
  native selects. All new select callers were audited and given explicit names.
  Discovery and management cases now pass at both sizes. The new directory
  fixture also accepts requests with or without a query delimiter.
- Intermediate compile/static failures (new required Rust DTO fields, a missing
  Query import/header constant, an unused TypeScript import, and a large Response
  error variant) were corrected before final checks. None remain suppressed.
- Docker's automatic subnet pool was exhausted. A temporary Compose override
  assigned this task's isolated network `10.231.112.0/24`; no existing networks,
  projects or databases were removed.

The shared response-aware fixture helper is reused for new navigation, with
successful complete delivery checked before UI assertions. No sleeps, retries,
assertion weakening or execution deadline increases were added. Public/private
visibility, disabled links and rejected membership actions retain negative tests.
No unresolved reliability follow-up is being assigned outside this change.

## Cleanup

Every PostgreSQL test invocation created and dropped its disposable database via
`scripts/test-db.sh`. The dedicated `orbit-recruitment-cb3e` Compose container,
network and volume were removed after final database verification. Vite and
Chromium processes used for browser checks and manual review were closed. Local
screenshots, logs and the ignored visual-review helper remain as review evidence.
Other running development projects were left untouched.

## Follow-up: visible recruitment image

On November 4, the public alliance/invitation pages and recruitment settings now
show a native image above the optional download action using one shared component.
Native right-click/long-press saving is available. The public-content safety test
now allows exactly this first-party image while continuing to reject embedded
markdown images, scripts and iframes.

Follow-up source fingerprint: `58df93fad82f3bbde8b8045033705c1555093b8a13d28e3f183dce9c510dc328`.
TypeScript, focused ESLint, changed-source Prettier and diff whitespace checks
passed. The existing focused browser suites passed all 18 cases (preparation
1.905 s, execution 11.4 s), with no failures. Browser fixtures separately checked
image decoding, download filename and responsive width at 1440 × 900 and
390 × 900 on all three surfaces. Visual captures use the previously rendered
server sample PNG as their image response and were inspected at both sizes.
The settings captures were refreshed as full pages to avoid a sticky header
overlapping a cropped screenshot. Vite and Chromium were closed.

## PR #339 review and CI repair

Initial head `ca60e26eb76bb6e6d24e2cf90f6d6fe680c57524`, CI run
`41865427159`, failed in two jobs. GitHub's Actions incident delayed status
visibility; the completed logs subsequently showed deterministic test assumptions,
not infrastructure failures requiring retries.

- `rankings::alliance_scores_capture_membership_and_assets_together_and_keep_source_history`
  still expected two public response fields (actual four). Its first repair now
  checks the exact four-field allowlist, retaining private-member exclusions and
  all score/history assertions. Audited the other public response allowlists.
- Both viewport instances of `mixed navigation content and public links retain
  native selection` expected ordinary alliance lookup pagination before search.
  Their first repair supplies the recruitment response, explicitly submits the
  ordinary search, and gates both transitions on successful response delivery.
  Native text-selection and touch-control assertions are unchanged. Audited all
  `Alliance directory pages`/`0 alliances` callers; these were the only callers.
- Review thread `PRRT_kwDOVRgPYs6zsEFz` correctly identified missing ranking
  enrichment in recruitment discovery. Nonempty pages now derive the global
  alliance score map once in the same database snapshot as the listing. Existing
  database coverage compares filtered and unfiltered results with public-page
  scores. Empty listings avoid unnecessary score calculation.

Test history and the local Test Czar audit were checked before repair. No tests
were removed, assertions weakened, retries added or deadlines changed in this
repair. Local checks: 10 alliance database cases passed (6.68 s compilation,
34.884 s execution), 2 rankings cases passed (11.67 s compilation, 4.844 s
execution), and both affected browser cases passed (1.957 s preparation, 4.5 s
execution). `make _static` and PostgreSQL Clippy all-target checks passed
(Clippy 28.24 s). The two initial failed CI jobs remain recorded; no queue removal
has occurred. The original CI also passed the build/unit job, the other database
jobs and seven browser shards.

Inspected updated public and in-game directory captures with rank/points at
1440 × 900 and 390 × 900. Images are local
`test-results/recruitment-ranked-{directory,game-discovery}-{width}x900.png`.
The browser review uses controlled HTTP data; native tests verify actual score
enrichment. Browser/Vite processes were closed and the task-specific disposable
Compose database, network and volume were removed after verification.
