# Alliance backend handoff — complete

Tasks 1 and 2 are implemented in the shared `feat/alliances` worktree. Source is frozen for coordinator integration. No commit, branch change, push or PR performed.

## Implementation

- Pure engine alliance state/action/permission policies with focused validation module and 19 regression tests. All recruitment modes, multiple roles, implicit leader, default baseline, delegation/revocation, self-escalation and superior-target denial, immediate transfer, author ownership, bounded posts/pins/audit. Even a no-op Update requires EditProfile or ManageRecruitment; denied commands leave state/revision/audit untouched.
- Exact application DTOs/reexports and service methods. Two projection tests cover private field omission, coarse activity boundaries, and revision-bound pagination. Nonmembers get no private AllianceDetail or leader identity.
- Migration0019 source tables, case-insensitive identity uniqueness, same-scope membership/application constraints, immutable hashed retry receipts, and historical affiliation intervals. No derived counts/scores/effective permissions/HTML persist. Receipts hold no old Markdown/application text.
- PostgreSQL source persistence/read modules. Social mutations serialize per universe/epoch with a transaction advisory lock; binding/epoch rechecked under universe shared lock. Atomic join/accept/create withdraw pending applications, update affected revisions, history and retry receipt. Exact retries survive leave/disband; mismatched intent and stale revisions conflict with rollback.
- HTTP private queries/commands use existing session/Origin/CSRF/protocol/binding gates; anonymous public route has its own bounded rate budget. Public/private rankings are enriched using `alliance_scores_in_snapshot` inside repeatable-read snapshots. Commands allow a bounded 128 KiB JSON body for legitimate maximum-length Unicode Markdown.
- Six real PostgreSQL/HTTP integration tests exercise concurrent duplicate create, join/join, accept/accept/create, six competing applications capped at five, pin races, board rolloff/pagination, case-insensitive name conflict, retry mismatch/rollback, transfer/leave/kick/disband privacy, delegated revocation, affiliation rename history, public rank consistency and authentication/Origin/CSRF/scope rejection.

## Integration details

`AllianceIdentity { id: Uuid, universe: UniverseId, tag: String, name: String }` matches parent use. Optional private DTO fields omit None. No OpenAPI changes requested.

Affiliation intervals use `[valid_from, valid_until)`, survive disband, and close/reopen on tag/name changes. Same-millisecond prior intervals may be zero-length; observations see the latest committed identity. Parent's delayed-report history reader uses the agreed columns.

Post cursor is an opaque RFC-compatible UUID encoding revision and page offset. Any alliance mutation invalidates it with Conflict; UI should restart pagination after refresh. This prevents pin/unpin/rolloff duplicates without persisting derived cursor state.

All new backend files are under engine/application/storage/transport alliance modules, migration0019, focused DB test and `docs/features/alliances.md`. Shared lib/port/router edits are additive. Parent owns final full-worktree formatting/validation, report/profile integration and shared Docker cleanup.

## Validation evidence

Base revision: `308785d86af4d5fb361c24f0e7f9fbeaea0c98e2` plus the shared working diff.

Final owned backend source SHA-256: `426a906e29719c5d98a3239359bb79481904eeb220d492d709f2a569d488fdb4`. Computed over sorted new backend `.rs` and migration0019 paths, concatenating path, NUL, file bytes, NUL (excluding docs/shared registration files).

- Final engine filter: **19 passed**, 3 unrelated skipped; 24.12s preparation including cargo lock wait, 0.069s execution. Includes coordinator's no-op Update denial and delegation grant/revoke fixes.
- Engine/application preceding final no-op guard: **20 passed** (18 engine + 2 application), 50 unrelated skipped; 35.47s preparation including shared cargo lock wait, 0.023s execution. Final engine-only rerun above adds the 19th engine test.
- `COMPOSE_PROJECT_NAME=orbit-alliances-1025 ORBIT_TEST_DB_PORT=55025 make _db-alliances`: **6 passed**, twice. First 11.84s preparation / 20.796s execution; second 6.95s / 20.519s. Native script dropped both disposable databases successfully. The second database run preceded the final pure-domain terminal/no-op guard; those changes passed focused engine tests and parent will run final integrated validation.
- Strict Clippy `--lib` for engine, application, storage and transport: passed, 8.15s, before final small terminal/no-op guards.
- `git diff --check`: passed after final edits.

No functional test failures. Initial compilation was blocked by the helper's stale sandbox/missing domain module, then an in-progress parent report-sharing argument edit; both were corrected. No execution timeouts. Shared Compose project remains running for parent validation.
