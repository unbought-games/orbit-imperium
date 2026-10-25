# Independent alliance domain/backend review — 2026-10-25

Scope: pure permission/delegation transitions, membership/application serialization and retry identity, private/public DTO projection, board limits/pagination, and durable source writes. Ranking implementation files were excluded from independent review. This review did not modify backend/domain files.

## Review result

No outstanding actionable findings in the latest inspected source. One independently reproduced authorization defect was fixed concurrently by the implementation owner while this review was in progress.

## Resolved during review

### P2 — No-op Update bypassed management authorization (fixed concurrently)

The earlier `Update` branch in `crates/engine/src/alliances.rs` checked EditProfile only when profile fields differ, and ManageRecruitment only when recruitment differed. If all supplied fields equaled the current view, neither authorization check ran. `execute` still increments revision and appends an Update audit record; `crates/storage-postgres/src/alliances.rs:142` then persists the rewritten alliance/roster and a receipt. An ordinary member could do this even after the leader removes every default permission. Repeated accepted requests invalidate every other member's expected_revision and board cursor and roll meaningful administrative events out of the bounded 100-entry audit despite the actor lacking all management and publishing rights.

Reproduction against the compiled engine library, without editing repository source: create alliance; join second player; leader SaveRole on default Member with empty permissions/grants; assert second player's effective permissions empty; second player sends unchanged Update with current name/tag/public_text/recruitment. The call succeeds and printed:

```
member_without_management_update_accepted=true revision_before=3 revision_after=4 audit_action=Update
```

The standalone proof is `/tmp/orbit-alliance-review-noop.rs`, compiled with `rustc --edition=2024 ... -L dependency=target/debug/deps --extern orbit_engine=<current rlib>`, then executed. The implementation owner concurrently added a management-permission guard at `crates/engine/src/alliances.rs:530-535`, followed by the existing independent checks for actual field changes. The new `unchanged_profile_update_still_requires_administration_and_is_atomic` regression in `crates/engine/src/alliances/tests.rs:958` proves denial leaves source/revision/audit unchanged. The reproduction above used the pre-fix compiled library; it is not a claim that the latest source still accepts the action. Fresh `cargo test -p orbit-engine alliances --lib` passed all 19 tests, including this regression (11.17 s build/preparation including Cargo lock wait; 0.01 s execution).

## Other reviewed behavior

No additional concrete escalation/privacy/race findings found in the reviewed paths. The transaction takes the shared universe lock then the same universe/epoch advisory lock before revalidating bindings, memberships, application cap, revision and permissions. Source changes and intent-hash receipts commit atomically, and receipt lookup precedes mutable alliance lookup, preserving exact retries after leave/disband. Role editing/assignment/deletion checks grantable ceilings, affected members' prior authority, and self-escalation; default role fallback and dependency checks are derived. Board capacity, pin limit and permissions run under the serialized source mutation. Private projection omits roster/activity/application/audit fields according to current rights and excludes private detail for nonmembers. Public reads return only summary and recruitment text.

Evidence: source review of `crates/engine/src/alliances.rs`, `alliances/policy.rs`, domain tests, application `alliances/projection.rs`, PostgreSQL `alliances.rs`, `alliances/{reads,persistence}.rs`, migration 0019, HTTP handlers and backend tests. Focused ranking validation separately passed 8 Rust tests and both PostgreSQL tests, including public summary consistency/privacy; those results are documented in `alliance-rankings-handoff.md`. Broader backend/HTTP test execution remains owned by backend/parent integrated validation.

Review snapshot: base commit `308785d86af4d5fb361c24f0e7f9fbeaea0c98e2`; SHA-256 of sorted reviewed paths, NUL separators and file contents: `3040ee2a0730bfe86d248e649f0017e28db9f951dac2741b84cae5c19409cd54`. Shared checkout remains active; parent owns validation of later edits.
