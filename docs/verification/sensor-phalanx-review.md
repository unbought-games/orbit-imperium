# Sensor Phalanx part 1 integration review — 2026-11-03

Reviewed original commit `a5a5f11ccd712f52b61821a81cc949756cbb26d7`
and compatibility repair `fe5e869ba0e9671bffb7d4e98ce19b95a743ebb5`.
Both are integrated unchanged into local branch `emick/sensor-phalanx`.

Review covered the visibility matrix and serialized disclosure, causal return
transitions, retained serialization/replay, PostgreSQL persistence, scenario
editing, and the deployment/activation boundary. No unresolved blocking finding
remains in the foundations scope.

The original migration would reject old-writer returning deployments and block
startup on inconclusive history. Its useful SQL diagnostic would also be hidden
by the migration error sanitizer. These were returned to the implementor as a
deployment compatibility repair. The repair removes the unpublished migration,
keeps unknown causes compatible with ordinary gameplay, and moves strict checks
to explicit readiness and evidence-classification interfaces. No startup backfill
or new schema constraint remains. Part 2 must implement the activation and
scan-time enforcement in the [integration contract](../architecture/sensor-phalanx.md).

Independent `make test-phalanx` verification used the clean implementation checkout
at each exact commit with development/test debug information and incremental
compilation disabled:

- Original revision: 222 engine and 87 application checks passed; compilation
  phases 13.96s and 27.12s, execution 4.203s and 0.172s, wall time 50.85s.
- Repaired revision: 224 engine and 87 application checks passed; execution
  4.133s and 0.167s, wall time 30.04s including compilation and runner overhead.
- No failed test attempts or retries occurred in this review. Setup and runner
  wait were not measured separately. `git diff --check` passed.

The implementor's [repair validation record](sensor-phalanx-rollout.md) supplies
the PostgreSQL, Clippy, static-check and disposable-resource cleanup evidence;
those checks were inspected rather than independently repeated here. Review
created no database resources or background services. Ignored test logs remain
under `test-results/sensor-phalanx/review/` in the integration checkout.

No production history inspection, dual-binary full-system rollout, UI change,
deployment, push or PR was performed. The tests support the specific serialization
and database compatibility claims; production rollout is not certified. Local
integration was a fast-forward and has no queue/merge delay.

## Part 2 integration review

Reviewed and fast-forwarded command backend
`5e0b4b87ee9df77fd8496e923397046b8c6b02de` and activation repair
`474e040828cbef0500673e4a7c61ab7e1ce21024` into the same integration branch.
Review covered paid-command authorization, complete endpoint loading and ordering,
atomic debit/report/receipt handling, historical privacy, activation and scenario
imports. No unresolved blocking finding remains in the backend scope.

The original handoff overrequired a server-side proof of binary-rollout completion.
The implementation therefore permanently rejected activation. The repair restores
the existing deployment contract: deployment tooling/operator completes rollout,
then invokes normal rules activation. No process registry or additional attestation
is required. Authoritative active-return checks remain at publication and scan
time. A rejected scoped boundary releases later settlement instead of stranding
it. Enabled scenario export/load also works normally, validating final facts
before commit. These corrections supersede the earlier handoff's writer-exclusion
proof requirement; they do not waive the existing deploy-before-activate contract.

Independent `make test-phalanx` passed on both clean exact revisions:

- Original: 227 engine and 88 application tests; compilation 10.51s and 12.04s,
  execution 4.140s and 0.176s, wall time 33.31s.
- Repaired: 227 engine and 88 application tests; compilation 9.28s and 11.55s,
  execution 4.112s and 0.198s, wall time 31.36s.

Neither independent run failed. Setup/runner wait was not measured separately.
The implementor's [activation repair record](sensor-phalanx-activation-repair.md)
supplies the reviewed 14 phalanx database/HTTP, compatibility, migration, focused
rules and static/lint results. Those database suites were not duplicated by the
reviewer. Logs remain in the integration checkout's ignored review directory.
Review created no database resources or services. Production deployment and
production-scale index build time remain untested. Nothing was pushed or deployed;
standard building activation and player UI remain part 3.
