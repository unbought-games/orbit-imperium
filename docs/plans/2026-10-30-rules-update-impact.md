# Rules Update Impact Implementation Plan

**Goal:** Activate debris-only rule changes without loading or rewriting planet state, while preserving correct production settlement for all other changes.

**Architecture:** Derive an activation plan from the validated current and proposed runtime rules. Initially allow only changes to `world.combat.ship_debris_bps` through a rules-only path; any other difference retains the existing settlement and initialization path. Both paths publish through the existing atomic, ordered activation boundary.

**Tech Stack:** Rust, Serde, SQLx/PostgreSQL, native nextest runners, existing Make targets.

## Global Constraints

- Never store derived state. Derive impact from the current and proposed rules; do not persist it in rulesets or queued barriers.
- Preserve part 1's immutable saved JSON, original identities, semantic no-ops, and historical references.
- Preserve revision checks, global activation ordering, claim fences, idempotency, transactions, and configuration invalidation.
- No deuterium feature, database migration, deployment change, new scheduling system, or general identity redesign.
- Keep functional network timeouts, readiness failures and assertions that verify timeout behavior.
- Routine CI has no configured job, step, suite or per-test execution deadlines.
- Full-system acceptance, process recovery, rolling-deployment validation, signup journeys and production-container validation remain explicit-only through Make or the manual workflow.
- Record the exact tested revision, failures, measured phase timings and cleanup.

Baseline: `298608c77a78320ec5403b8b11d24dba49ef5369`, including PR #246.

---

### Task 1: Derive the necessary activation work

**Files:**
- Modify: `crates/engine/src/rules_update.rs`
- Create: `crates/engine/tests/rules_update_impact.rs`

**Signatures:**

```rust
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
pub enum RulesUpdateImpact {
    Unchanged,
    RulesOnly,
    SettleAndInitialize,
}

pub struct RulesUpdatePlan {
    pub impact: RulesUpdateImpact,
    pub initialize: RulesCatalogDelta,
}

pub fn plan_rules_update(
    current: &Ruleset,
    next: &Ruleset,
) -> Result<RulesUpdatePlan, RulesError>;
```

**Behavior:**
- Reuse `validate_rules_update` for semantic and structural validation; retain its existing return contract for other callers. Invalid proposals never receive an executable plan.
- Equivalent runtime rules return `Unchanged`, including historical aliases/default omissions with different saved hashes.
- Return `RulesOnly` only when speed and the complete typed artifacts match after normalizing the explicitly permitted `ship_debris_bps` field. Require existing combat profiles on both sides. Compare everything else, so new or unclassified fields cannot silently enter the fast path.
- Return `SettleAndInitialize` for every other valid change, including a debris edit mixed with a production, speed, capacity, catalog, or research change. Retain the existing catalog delta.
- The deuterium toggle does not exist yet. Add it to this small allowlist with explicit coverage when that feature is implemented; do not introduce it here.

**Tests must prove:**
- Equivalent saved representations are unchanged; a debris-percentage-only edit is rules-only, including 0 and 10000 basis points.
- Invalid percentage, unsupported policy, malformed references, and forbidden structural edits remain rejected.
- Production/base-income, speed, storage capacity, satellite/fusion parameters, building/research additions, and unrelated combat changes take the conservative path.
- Mixing any non-allowlisted change with a debris edit never bypasses settlement/initialization. Assertions should compare the whole remainder of the artifact rather than maintain an exhaustive list of economic dependencies.

### Task 2: Branch state preparation inside the existing publication transaction

**Files:**
- Modify: `crates/storage-postgres/src/rules_update.rs`
- Modify: `crates/storage-postgres/src/runtime_barriers.rs`
- Modify: `crates/storage-postgres/tests/rules_updates.rs`
- Create: `crates/storage-postgres/tests/rules_updates/impact.rs`

**Signatures:**
- Change the internal `Boundary` field `delta: &RulesCatalogDelta` to `plan: &RulesUpdatePlan`.
- Keep `publish(tx: &mut Tx<'_>, boundary: Boundary<'_>) -> Result<RulesApplyOutcome, RulesUpdateError>` and the public rules-store methods unchanged.

**Behavior:**
- Serial activation derives the plan after reading and revision-checking the active rules. Scoped activation derives it again from the actual current rules when processing the durable barrier; do not save a preview classification in the barrier.
- For `RulesOnly`, skip `load_states`, gameplay lineage scans, and `settle_and_initialize`. Do not read or write body amounts, carry, checkpoints, revisions, building/research levels, inventories, queues, fleets, or historical gameplay records as part of activation preparation.
- For `SettleAndInitialize`, preserve the existing old-rules production settlement, next-rules validation, initialization, capacity checks, and writes. This task does not optimize individual economic dependencies or per-planet selection.
- Keep the shared publication tail: verify/insert the immutable rules snapshot, update active identity/revision, record effective time and sequence, preserve serial frontier handling, bump viewer/world revisions, and append configuration updates. Keep existing enrollment coordination and scoped ordering barriers. `Unchanged` remains `AlreadyActive` without an activation.
- This removes gameplay-state work, not all population-related work: existing viewer invalidation/notification fanout remains. Do not promise constant-time activation or change the delivery protocol.

**Tests must prove:**
- In both serial and scoped modes, a debris-only activation succeeds while test-local SQL guards reject planet/gameplay-state reads and writes. Prove the guards catch forbidden access themselves. Reuse the disposable-database instrumentation style from `tests/rules_loading.rs`; do not add production instrumentation or a timing-based assertion.
- Independently compare stored planet amounts, fractional carry, checkpoints, revisions, levels, and relevant pending work before/after; only expected configuration/publication records change. The next ordinary economy settlement accrues the entire interval correctly despite the unchanged checkpoint.
- Active rules/revision and one activation record change, clients receive invalidation, another universe stays unchanged, and repeated apply returns `AlreadyActive` without repeating effects.
- With a controlled clock, production or speed changes settle the pre-boundary interval at old rates and the post-boundary interval at new rates, without lost/doubled accrual or rounding carry. Include a mixed debris/production edit and preserve existing satellite/fusion boundary coverage.
- A scoped debris-only proposal waits for earlier admitted/claimed work; encounters before/after activation use the correct debris percentage. Existing accepted mission costs/deadlines remain unchanged. Retrying a pending equivalent proposal reuses its boundary.
- Stale revisions still fail. An injected failure in shared publication rolls back the fast path completely; retry succeeds once. Existing full-path failure/initialization tests remain intact.

### Task 3: Expose the impact in operator previews and document the boundary

**Files:**
- Modify: `crates/application/src/rules_update.rs`
- Modify: `crates/application/tests/rules_immutable.rs`
- Modify: `crates/server/src/rules_cli.rs` only for affected preview tests
- Modify: `docs/operations/rules-updates.md`
- Modify: `Makefile` only if needed for a focused native test target

**Signatures:**
- Add `pub impact: RulesUpdateImpact` to the operator-only `RulesDiff`; retain `initialize: RulesCatalogDelta` and existing hash/change fields.
- `RulesService::diff` uses `plan_rules_update` for preview impact and initialization. No game HTTP/OpenAPI contract changes.

**Behavior:**
- `rules diff` and standard-upgrade dry runs explain `Unchanged`, `RulesOnly`, or `SettleAndInitialize`. The label is informational; execution always derives its own plan from current rules.
- Document that only debris percentage edits are optimized initially, mixed changes remain conservative, and ordinary rules-only activation requires no data conversion or special backup/restore workflow.
- Document that readiness, full audits, deployment compatibility, and all existing ordering guarantees retain their separate roles. No schema or persistent impact field is added.

**Tests must prove:**
- Preview classifies unchanged, debris-only, mixed, and production edits consistently with execution, without writing records.
- Existing stale-document, forbidden-structural-edit, and semantic no-op behavior is preserved. Existing preview initialization fields retain their meaning.

Validation uses the new deterministic classifier tests, the full relevant PostgreSQL rules-update suite (including both runtimes), and normal repository checks. Use the existing disposable Compose setup and Make/npm runners; no production or full-system run is required for this scope. No UI screenshots are applicable.
