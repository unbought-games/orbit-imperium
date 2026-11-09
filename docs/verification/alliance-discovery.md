# Alliance discovery — November 6, 2026

Base revision: `5f61be6982cc9b396aa29ae63553c35faa83d323` plus the uncommitted implementation.
Pre-popover-move source/test/contract SHA-256: `0508eb5c61c2c1fd2dcd851bd8617d116b4890bcbef0b71372cf1fcd7d32c845`.
Fingerprint includes sorted changed and untracked paths under `apps/web/`, `contracts/`, and `crates/`, each followed by NUL, file bytes (or `<deleted>`), and NUL.

## Scope

One authenticated directory searches every alliance by default. Language, experience,
activity and recruiting-only filters combine before counting and pagination. Closed
and unlisted alliances remain searchable by authenticated players; public recruitment
retains its existing opt-in policy. Creation has dedicated body and universe routes,
including canonical navigation, direct reload, and return to the new alliance.
The shared InputGroup/InputAccessory composition owns the search field's icon placement
and keyboard focus frame. Empty applications and empty pagination are omitted.

## Validation

- `make _db-alliances`: 11 passed. Compilation 28.18 s; serial execution 38.594 s.
  The native runner created and dropped its own database on this checkout's local
  PostgreSQL container. No playground reset or destructive game operations.
- `npm test -- apps/web/src/client-model/alliance-directory.test.ts apps/web/src/client-model/alliances.test.ts apps/web/src/shell/routes.test.ts`:
  26 passed in 164 ms after the single assertion update described below.
- Fixture browser run of alliances and recruitment: initial preparation 2.079 s;
  14 passed, 2 failed, 3 interrupted, 1 not run (approximately 1.7 minutes).
  Focused repaired/uncompleted cases: preparation 1.963 s, 6 passed in 5.4 s.
- Changed mobile-selection scenarios: preparation 1.936 s, 2 passed in 4.6 s.
- Own-alliance navigation from discovery: preparation 2.007 s, 1 passed in 2.9 s.
- TypeScript, ESLint, changed-source Prettier, Rust formatting, OpenAPI/schema drift,
  and whitespace checks passed. `cargo check -p orbit-storage-postgres` passed
  in 21.75 s. `make _dev-binary` rebuilt the running server in 18.88 s.
- Browser layout assertions cover 1440×900 and 390×900: combined filters,
  pagination reset, empty results without pagination, search reset, visible keyboard
  focus, no horizontal overflow, and search controls no taller than 46 px.
- Dev instance restarted at the original URL, retaining its database and login.
  The Codex browser's accessibility state confirms the new empty-directory screen
  and always-available Filters control. Temporary viewport override was reset.

Screenshots and final pixel inspection are explicitly deferred at the user's request.
Browser runs set `ORBIT_TEST_SCREENSHOTS=0`. No claim of completed visual review.
Fixture servers and browsers were cleaned up by the runner; the requested dev instance
remains running. Runner scheduling/cleanup time was not measured separately. No push,
CI run, queue operation, or merge occurred.

## Failure evidence and repairs

Inspected Git history (`68aa2e78` for the controller; `6ec52dfd`, `e8a96d81`,
`9415a56a` for browser scenarios) and the repository test-performance repair ledger.
No separate owner Test Czar ledger was available.

- The revoked-membership unit case expected three reads, including the former
  implicit directory fetch. Discovery now owns its own queries. Replaced that obsolete
  call count with an exact assertion of the two Mine requests. Membership clearing,
  error handling, pending state and access-loss assertions remain intact.
- Both new responsive directory cases counted nested preference list items as
  alliance rows (80 instead of 20). One repair scopes the count to direct list children.
- Creation help text and native select option text were included in wrapped labels.
  Creation and public filter cases waited on exact control names that no longer matched.
  Stopped the stalled run, assigned explicit accessible names matching the visible
  labels, and reran only affected/uncompleted cases. All passed without retries,
  sleeps, or timeout changes.
- Obsolete refresh-button interactions were removed. Lost-access coverage uses
  the remaining My alliance navigation; cursor recovery and rejected-draft assertions
  remain. Empty-pagination selection coverage now checks the empty-state text and
  search control, with an explicit assertion that pagination is absent.

No scenarios were deleted in that initial validation. See the subsequent removal below. Deterministic controller tests cover stale completion,
cancellation, retained results during reload, and error reporting. Database coverage
checks combined filters, counts and offsets, legacy requests without new fields,
closed/unlisted groups, and unchanged public opt-in behavior.


## Recruiting checkbox moved into Filters

The checkbox now lives inside the shared desktop popover/mobile sheet, remains open
when toggled, contributes to the active filter count, and resets with the other
preferences. The live Codex browser confirms it inside Alliance filters; existing
user selections were preserved. No screenshots were captured.

Focused browser preparation: 2.100 s; desktop passed in 2.3 s; mobile failed in
9.6 s (runner total 10.5 s). The mobile test had already received its one repair
for nested list-item counting, so it was removed outright under AGENTS.md and
was not rerun, renamed, or replaced. Error context shows an empty search field
and 21 prior results after the test attempted to fill `missing` immediately after
Escape from the sheet. This is consistent with the test interacting before native
modal dismissal completes; the exact event sequence was not instrumented. No
production defect was established, and no timeout or sleep was added.

Audited the other affected callers: public recruitment tests keep the filter
surface open; the surviving desktop case does not use a native modal. Existing
action-sheet tests separately cover dismissal/focus. Database tests retain the
language/recruiting combinations, and deterministic controller tests retain stale
response/cancellation coverage. Any future investigation of the removed mobile
sequence belongs in this originating chat before final mobile visual review;
owner is the implementation agent. Screenshot/visual review remains deferred.

ESLint, TypeScript, formatting and whitespace checks passed for this update.
Final source/test/contract SHA-256: `e26d0d5f27a6c23a1282f439f6f8610cbdf48086eecd60bff8104cdd5ed4813c`.

### Search toolbar placement

Filters now stays to the right of the search form, with an icon-only 44px touch target below 768px. Clear filters occupies a separate row when present.

Validated working-tree source SHA-256: `d7968cf562763e58cd86ee4721e6f81f4d7c496a285e4bcd1cd3c7840846493e`. Focused desktop search/filter browser test passed (preparation 1.921s; test 2.1s; runner 3.0s; no failures). Temporary test runner and Vite cleaned up by the npm runner. Live browser at 468px confirmed adjacent controls, no horizontal overflow, accessible active-filter count, and sheet opening/dismissal. Scoped ESLint, Prettier and whitespace checks passed. Screenshots and visual review remain deferred at the user’s request.

### Shared orbital loading feedback

Working tree based on `5f61be6982cc9b396aa29ae63553c35faa83d323`; source/test fingerprint SHA-256 `921759070860e94cfc192d4c84e5e0a69320574a5af21bb2487b663fd19ab733` (sorted paths above: shared loading files, Alliance directory/workspace/public/welcome and stylesheet, browser spec and Playwright config).

Added a persistent LoadingRegion with a 200ms reveal delay and 500ms minimum visible duration. Request data is never delayed or copied. Temporal presentation state is separate from authoritative request state. Content stays mounted; slower loads hide it behind a centered orbital indicator in the same reserved space. Reduced-motion stops both orbits. Initial Alliance workspace, search results, public profiles, welcome and public universe chooser use it. Existing empty results no longer disappear immediately on every request. Other feature loaders are not migrated by this change.

Validation:

- Timing and directory unit tests: 8 passed, 160ms runner duration. Covered fast completion, minimum visibility, long requests, overlapping requests and cleanup/reactivation.
- Existing discovery/public profile browser checks: 4 passed, preparation 1.975s, runner 3.7s.
- New held-response loading browser checks: 2 passed at 1440×900 and 390×900, preparation 1.921s, runner 1.7s. Verified unchanged result-area geometry, centered icon, search focus/value, operable Filters, reduced motion and deferred content reveal. Responses were explicitly delivered and React content observed before advancing the fake clock.
- The first browser invocation did not select the new spec because the fixture suite has an explicit file list. Registered the spec and ran it separately; no test failures or repairs.
- TypeScript, scoped ESLint, changed-source Prettier and whitespace checks passed. Final CSS preserves public-page paragraph spacing after adding the content wrapper.
- Both npm browser runners cleaned up their temporary Vite servers and port leases. The development instance remains running. No commits, CI or merge attempted.
- Screenshots and visual review remain deferred under the user's explicit instruction. Browser assertions establish behavior and geometry, not visual polish.

### Centered creation form

Create Alliance now uses the existing focused ContentColumn used for dispatch. TaskHeader supports a leading control and symmetric centered title. The Back link is an arrow plus “Back”, using the shared ghost variant. Working-tree changed-source fingerprint: `28cdaa99737528d0d41b73b075b52a0dc9009aa0fb87ac7f29ab4700ce77d41f` (same base revision above).

TypeScript, scoped ESLint, Prettier and whitespace checks passed. Existing application/withdraw/create flow: 1 passed, preparation 1.938s, test 2.5s, runner 3.2s, no failures; temporary runner cleaned up. Live DOM geometry at 1508px and 390px confirmed aligned form/title/column centers, left-hand Back and no mobile overflow; verified ghost variant with no decorative plate. Restored the browser viewport. Screenshots and visual review remain deferred.

### Separate discovery route

Added planet-scoped and universe-scoped `/alliance/discover` routes. Alliance home holds membership controls and pending applications, with an empty state and discovery link for nonmembers. Discovery no longer uses a local page toggle. Creating/joining/applying returns to Alliance home. Legacy alliance selection URLs redirect to discovery while preserving query/hash. Invitation entry and the Empire nonmember discovery link target the new route.

Working-tree fingerprint SHA-256 `b010206ffe6952eb39144992c0d200db90cf1ee310dc4479a8c278114c279130` (route, screen, navigation, header and focused test files), same base revision above. Route/recruitment units: 18 passed in 257ms. Seven relevant application, creation, discovery, profile, access-loss and manager browser tests passed (preparation 1.924s; runner 6.9s). Four routing checks passed at desktop/mobile and without planets (preparation 1.834s; runner 5.3s), covering legacy URLs, query/hash preservation, planet selection, reload and history. That routing run logged two refused proxy requests to the unused fixture backend for overview/alliance query; assertions passed, and the cause of those fixture diagnostics is not established. No test failures or repairs. Existing access-loss scenario now reloads the page because the redundant My alliance button was removed; it retains assertions that private data disappears after a 403.

TypeScript, scoped ESLint, changed-source formatting and whitespace checks passed. Live dev navigation verified your alliance board → discovery list → Back to your alliance. Temporary browser runners cleaned up; development server remains running. No screenshots taken under the user’s standing override; final visual review remains deferred.

## PR preparation — November 7, 2026

Final implementation keeps Filters on the **left** of search and Discover alliances in the own-alliance header. Public-page identity/artwork/editor concepts remain design-only and are not included in this change.

- `make _static`: Rust formatting, full frontend lint/format, contracts and architecture boundaries passed.
- Five focused unit files: 35 passed, runner 252ms.
- Production build passed: 22.87s wall time (client bundling 7.29s; prerender bundling 0.744s).
- Five changed browser specs: preparation 1.920s; 44 passed and one failed in 45.8s; end-to-end command 48.76s. The failure expected the discovery controller's transient “Alliance updated.” message after successful retry, but retry now navigates to Alliance home and unmounts that controller. Failure DOM showed the correct home route. Inspected the scenario's history (introduced in 68aa2e78) and repository test-performance audit; no prior repair for this assertion was found. Replaced only that obsolete success signal with response-gated Mine delivery, home URL/heading and disappearance of Retry; retained the original disabled form, exact payload, command identity and two-request assertions. Unit coverage still verifies the controller notice itself. Audited other consumers of the same notice: only the controller unit assertion remains.
- Single focused repair run: preparation 1.903s; 1 passed in 2.7s (test 2.0s), end-to-end 5.50s. No sleeps, timeouts, retries or test removal.
- PostgreSQL filter behavior retains the earlier 11-test pass; backend filter code has not changed since that run.
- Browser and build subprocesses cleaned up by their native runners. No separate runner queue delay was measured locally.
- Implementation screenshots remain deferred under the user's explicit instruction. Generated concept images are not implementation verification and are not bundled in the PR.

### Main integration before PR

Integrated main `017997bf` because the merge check found conflicts. Preserved the new Briefing route guard alongside the Alliance routes and combined the browser suite registrations. Kept main's deliberate removal of the unreliable public recruitment navigation scenario from PR #360; its prior failure and retained deterministic coverage are recorded in the test-performance audit. Did not resurrect the removed scenario. Generated contracts and routes were refreshed.

Tested code tree before this documentation append: `a2ff527af984fbec0cfa8acb2e75787574ad743b`. Integrated checks: `make _static` passed; 35 focused units passed in 216ms; production build passed in 25.21s; 44 browser tests passed with 1.889s preparation, 47.6s runner and 50.41s total command time. PostgreSQL alliances: 11 passed; compilation 54.83s, execution 38.380s, total command 95.31s. Disposable database cleanup is owned by the test-db shell trap. No integration test failures.

## November 9, 2026: Alliance PR #362 feedback

Reviewed failing CI run 42434513400 at head 54e6f6fb. Native build/lint/unit checks passed; the separate aggregate “Build, lint and unit tests” gate failed because database/rest and browser shard 1 failed. No top-level CI conversation comments were present.

- Validated Bugbot thread PRRT_kwDOVRgPYs608nmU: welcome retry called the controller directly, bypassing navigation, profile invalidation and recruitment tracking. First submissions, ordinary retries and welcome retries now share one successful-completion path; retry captures the original pending action before the controller clears it. New Join/Apply welcome browser cases verify home destination, resulting board/application list and identical retried command ID/payload after an explicit 503.
- Browser failure `open and closed recruitment and existing membership drive the available controls`: the five-second assertion began after HTML navigation through two route transitions, before both Mine/public data were known delivered. The failure artifact already contained the expected closed-recruitment text. Inspected test history and this ledger; no prior repair to this scenario was found. This is its one repair: a shared response helper registers both required listeners before navigation/reload, then asserts actual content. The scenario's directory transition is also response-gated. Audited the other public-profile caller and applied the same readiness helper to uncertain retry; all original assertions remain. No sleep, timeout change or rerun-for-luck.
- Database failures `alliance_identity::delayed_espionage_preserves_event_affiliation_through_rename_disband_and_sharing` and `alliances::accept_join_create_compete_and_withdraw_all_pending` occurred in fresh schema preparation at the existing ten-second production deadline, before domain assertions. Four cold database binaries started together; resource contention is the working diagnosis. Limit CI database work to two binaries using Make's existing DB_JOBS setting. All binaries share this limit; each still has its own disposable database and serial tests. No production migration/lock/statement timeout, database durability, assertion or suite selection changed. The same first four suites are the local validation batch; CI must confirm the runner-capacity repair.
- Integrated main 901cad85 because GitHub reported a conflict; combined the arrival/loading browser suite entries and regenerated contracts/routes.

Local validation after repair: 4 focused browser tests passed (preparation 4.978s; runner 8.1s); 18 relevant units passed in 321ms; 129 tooling tests passed with one existing skip in 16.510s; full static checks and production build passed (17.94s). All 17 PostgreSQL tests across alliance_identity, alliances, analytics and attack_groups passed with DB_JOBS=2 (compile 30.97s, total 105.64s; alliance suite 46.177s and attack_groups 60.483s). Native runners cleaned up browser servers and disposable databases. No repair validation failures or removals. This chat owns the first repair and its CI follow-through; there is no unassigned independent follow-up. Implementation screenshots remain deferred under the user's standing instruction.

### November 9: unknown Empire alliance membership

Validated the second Bugbot finding, thread PRRT_kwDOVRgPYs61UJl6. An absent/expired player profile was treated like confirmed nonmembership and routed to discovery. Unknown membership now opens Alliance home with the neutral “Open alliance” label; only a delivered profile without an alliance offers discovery. Held-response browser scenarios cover member and nonmember profile arrivals without sleeps or clock assumptions.

Initial new-scenario run: member passed; nonmember failed because the authored fixture sent `alliance: null`, but PlayerDisplay permits an omitted field rather than null. Checked the schema, scenario history and repair ledger: this newly added case had no previous repair. Its single repair omits the absent field and types the fixture with PlayerDisplay. Focused nonmember repair passed (1.9s test, 3.7s runner, 4.148s preparation); initial run was 10.6s with 5.484s preparation. No production workaround or assertion relaxation. TypeScript, scoped ESLint and whitespace checks passed.
