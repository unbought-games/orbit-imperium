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
