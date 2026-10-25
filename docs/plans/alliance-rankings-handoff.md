# Alliance rankings integration handoff

- Application DTOs and exact scoring live in `crates/application/src/rankings.rs`. `RankingFacts` now requires `alliances: Vec<AllianceRankingObservation>`; historical `RankingObservation.alliances` is optional (`None` for legacy, `Some([])` for genuinely empty).
- `crates/storage-postgres/src/rankings.rs` exports `pub(crate) async fn alliance_scores_in_snapshot(tx: &mut Tx<'_>, universe: UniverseId, epoch: Epoch) -> Result<BTreeMap<Uuid, AllianceScore>, StoreError>`. Parent can call this inside public/private alliance read's existing repeatable-read transaction, then select summary ID. It derives current rank/points/average and yesterday movement from the exact same implementation as High Scores. No memberships leave that helper. It does not insert daily history (only opening rankings does).
- Alliance sums use i128 for aggregate of each player's checked i64 valuation. Both total points and average points floor from exact micro values; competition ranks compare whole total points.
- Parent delegated score enrichment to backend owner; rankings PostgreSQL test now asserts public-summary consistency. This worker covers ranking source/storage/UI tests.

## Validation progress

- `npm test -- apps/web/src/client-model/rankings.test.ts`: 5 passed, 285 ms (2026-10-25).
- `npm run test:ui -- high-scores.spec.ts`: all 7 passed, 6.0 s; includes existing player cases plus alliance search/tag, paging, own-alliance focus, switching, legacy response, exact large values and 320/390/768/1440 widths. Vite/browser cleaned up by runner.
- `npx tsc --noEmit -p apps/web`: passed twice, including after all ranking test additions.
- Initial `cargo test -p orbit-application rankings --lib` could not compile because parallel backend engine module was not yet registered (`orbit_engine::alliances` unresolved); also parent report-sharing test referenced missing `fixture`. Will rerun when dependencies land.
- Native PostgreSQL `make _db-rankings` used parent-owned Compose project `orbit-alliances-1025`, port 55025. New test checks uncommitted source visibility, atomic membership/assets, source-only daily history, disband and legacy baseline. No Docker project cleanup by this worker.
- `make _db-rankings` first attempt failed during compilation on missing `orbit_engine::alliances` (backend work still in flight). Disposable test DB cleanup trap ran. No ranking test executed; no success claimed.
- Focused ESLint and `node scripts/check-boundaries.mjs` passed. Ranking-file `git diff --check` passed.

- Added public summary consistency/privacy assertions to the new PostgreSQL ranking test. They expect `public.summary.ranking` from the shared helper; backend owner integrated this and final database checks pass.

## Implementation coverage

- Player affiliation is captured in the same ranking source observation, with public tag links beside (not inside) player detail buttons. Detail identity uses the observed alliance explicitly.
- UI is a Players/Alliances switch over one retained response, including search by normalized name/tag, pagination with global ranks, exact BigInt number formatting, own-alliance highlighting/focus/navigation, member count and average points, and separate daily baseline messaging.
- No contract/generated files or branch/Git history touched by this worker. New source facts live only in existing historical observation JSON, with optional legacy compatibility; no migration for rankings.
- Architecture updated in `docs/architecture/high-scores.md`.
- Rust ranking unit rerun passed all 8 tests (4.00 s Cargo preparation, <0.01 s test phase).
- PostgreSQL attempt 2 reached storage compilation but failed in parent-owned `crates/storage-postgres/src/report_sharing.rs:53`: `options: Some(...)` accidentally has two arguments, first `&alliance_identities`. Fix there before rerun; rank modules compiled through application successfully. Disposable DB cleanup trap ran.

## Final ranking validation

Source base: `308785d86af4d5fb361c24f0e7f9fbeaea0c98e2`. SHA-256 of the focused ranking implementation/test/documentation Git diff: `3d473fb95ad1a6730a28769e9aec1dc8863f4d4e4a9c59c8089276657c106b58`. Shared checkout contains concurrent feature work, so parent owns final integrated full-tree revision/digest.

- Final `COMPOSE_PROJECT_NAME=orbit-alliances-1025 ORBIT_TEST_DB_PORT=55025 make _db-rankings`: **2 passed**, 8.66 s compile/preparation, 4.333 s tests (2.202 s alliance sources/public consistency; 2.131 s existing ranking authorization/history). Native script created and dropped its disposable DB; shared Compose left running for parent.
- Final Rust rank tests: **8 passed**, 4.00 s preparation, <0.01 s execution.
- Client rank selector/controller tests: **5 passed**, 285 ms. Existing ranking coordinator tests: **2 passed**, 352 ms.
- Browser High Scores: **7 passed**, 6.0 s, including narrow layouts; runner cleaned Vite/browser.
- Focused ESLint, Prettier check, TypeScript, boundary checks and whitespace diff check passed.
- Earlier dependency compilation failures remain recorded above and were resolved before the final PostgreSQL pass. No timeout, weakened assertion, skipped test, deployment, commit, push, or PR.

Ranking implementation is complete. Parent subsequently requested independent domain/backend review; results will be in `docs/plans/alliance-review.md`.

Independent review completed in `docs/plans/alliance-review.md`: no outstanding findings in latest inspected source. One no-op Update authorization bypass was independently reproduced against the earlier engine library and fixed concurrently by the owner; current focused domain suite passed all 19 tests (11.17 s preparation, 0.01 s tests).
