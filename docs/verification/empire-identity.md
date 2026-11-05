# Empire identity verification — November 5, 2026

Implementation branch: `emick/empire-identity`.
Base revision: `2d6f226ac76cab528d6c820ea18ffa9eea87d2b7`.
The implementation is an uncommitted working-tree change; the exact source digest
and per-file manifest are recorded below. No PR, queue entry or deployment was made.

## Scope and boundaries

Names, taglines and per-empire title selections extend the durable profile record.
Twelve free titles ship in the community application. A version-2 immutable catalog
can supply additional titles with free, supporter or earned access. The private
content companion contains ten supporter definitions and validated publication
support; it was built locally, not published or activated. Private content locations
and deployment configuration are intentionally absent from this public record.

Permanent grants use one generalized table, with a compatibility view for existing
insignia consumers. The trusted transactional grant hook is ready for future
achievement evaluators; no unverified achievements or automatic awards are created.
History captures event-time authored identity and stable title references. It does
not retrofit unknown identities into older events. Current identity appears in the
profile, account overview, dossier and orb form of address.

## Checks and phase timings

- Dependency setup: `npm ci --no-audit --no-fund`, approximately 3 seconds.
- Initial application/HTTP library run: 166 passed; preparation 26.05s, execution
  25.008s. After catalog/policy additions, focused identity/insignia tests: 19
  passed, preparation 8.62s, execution 0.044s (148 unrelated tests skipped).
- Server cosmetic configuration: 1 passed; preparation 34.15s, execution 0.013s.
- Final profile/history database suite: 7 passed; preparation 20.81s, execution
  15.556s. Insignia integration: 1 passed (11.37s preparation, 3.587s execution).
  Archive upgrade integration: 1 passed (0.77s preparation, 0.743s execution).
- Final client run: all 1,388 tests in 146 files passed in 5.02s.
- Combined focused browser run: 9 passed in 8.1s, with 1.976s module preparation.
  After final overview/dossier presentation adjustments, all 6 identity/history
  cases passed in 4.9s with 1.980s module preparation. The other 3 cases exercised
  orb startup, caption lifecycle/layout, and return-refresh behavior.
- Workspace Clippy with all targets and server test-support: passed in 10.07s.
- Production web build: passed; Vite client 3.82s and SSR 0.304s. Existing
  large-chunk and router circular-dependency notices remain. Whole build/setup
  wall time was not separately instrumented.
- Formatting, ESLint, generated contract drift/schema compilation, transport
  boundaries, and community cosmetic distribution regression passed.
- Separate private publisher: 6 tests passed and immutable manifest built.

All runners were local; remote runner wait, CI queue delay and merge delay are not
applicable. Native routine test execution limits were not changed. Logs are retained
locally under `test-results/identity-verification/`.

## Failures, diagnosis and repairs

Repository history and the available profile verification/Test Czar notes were
consulted; no separate repair ledger was present. No tests were deleted or weakened.

1. Docker preparation failed once because the machine's default address pools were
   exhausted. A task-local Compose override used an unused explicit subnet. No
   unrelated containers, networks or volumes were changed.
2. One database case failed because fixture cleanup deleted a synthetic profile
   without its new retained identity observation. Its single repair deletes that
   synthetic observation before fixture teardown. Actual archive retention remains
   enforced. Subsequent focused database runs passed.
3. One adapter test expected the old exact header set. Its single update asserts
   the new identity negotiation header alongside the existing headers.
4. Three early editor browser runs were interrupted to diagnose an unresolved title
   locator. One exploratory filter selected no tests. Instrumentation showed that
   the wrapped select's accessible name included option text. The product now gives
   the selector the explicit accessible name Title. Fixture session membership was
   also corrected to its actual contract shape before save-flow verification.
5. The new editor test then failed once because Playwright's disabled matcher did
   not recognize a native disabled option, despite its actual disabled property and
   accessibility snapshot. Its single repair checks that native property directly
   for both locked options. Desktop/mobile flows then passed, including refresh,
   explicit conflict recovery, retained drafts, and missing-title text edits.
6. Two viewport variants of the new dossier/orb test initially lacked a startup
   caption: the general game fixture included an incoming hostile fleet, which
   intentionally suppresses it. Their single repair provides the empty mission
   state needed for the startup assertion. Response gating remains intact; neither
   sleeps nor timeouts were added. Both passed. Other callers intentionally exercise
   hostile state and were left unchanged.
7. The private publisher's first run had three errors because its root-field guard
   had not yet accepted the titles field. The format validator was fixed; all six
   tests and the build passed, without changing the assertions.
8. Clippy rejected a test's field reassignment after Default construction. The test
   now initializes its authored fields directly; Clippy passed.

Additional review fixed a stale-identity cache edge case: expired remote supporter
observations no longer prevent fresh local identity text from being accepted.
Deterministic tests cover both retaining authored text through an outage and
accepting new local text without reviving expired supporter decoration.

## Visual review and cleanup

Inspected running profiles, editor/preview, missing-title state, conflict/draft
state, overview, dossier and orb at desktop 1440×1000 and mobile 390×1000. Refreshed
captures after UI fixes. Contact sheets label screen/state and viewport dimensions.
Game chrome uses viewport captures rather than full-page stitching of fixed UI.
Screenshots use independently authored fixtures and are delivered inline in the
implementation chat, not uploaded or attached to a PR.

All browser/Vite runners exited. Disposable Compose project
`orbit-identity-validation` had no remaining `orbit_test_*` databases. Its database
container, volume and network were removed. Screenshots, source manifest and logs
are retained locally. No production data or services were used for validation.

Source SHA-256 (all changed/new source and documentation except this verification
record): `9abddc2782e75666cec55c0139b959e1b7862478b6d78b48cd2eb447ae0d1622`. Per-file hashes are retained in
`test-results/identity-verification/source.json`.
