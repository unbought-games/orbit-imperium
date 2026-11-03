# Sensor Phalanx rolling-deployment repair — 2026-11-03

Base commit: `a5a5f11ccd712f52b61821a81cc949756cbb26d7`.
Branch: `emick/sensor-phalanx-foundations`.
Tested source SHA-256:
`d06220f03446e00d6f68d4e4e932739c20f719fdb0aafd4e40418fd71c163b86`.

The digest covers eight changed code paths relative to the base, including the
removed migration and both new source files, excluding documentation. For each
sorted relative path hash path bytes plus NUL, then either `present` plus NUL,
file bytes and NUL, or `deleted` plus NUL. Source was not changed after final
validation. Manifest and logs are retained locally in ignored
`test-results/sensor-phalanx/rollout/`.

## Change and compatibility evidence

The unpublished migration 0033 is removed. Ordinary deployment has no causal
backfill, historical-journal traversal, unknown-cause constraint or new DDL. It
uses the same migration bundle as the reviewed pre-cause baseline. Omitted causes
remain unknown, readable and writable while scans are disabled. New transitions
continue to record causes.

The previous migration tests requiring startup to reject ambiguous history and
old writes were replaced because that behavior was the deployment defect being
removed, not because the tests were intermittent. Their useful protections now
live at explicit boundaries: deterministic evidence classification and readiness
refusal. Historical results from the original implementation remain in
[sensor-phalanx-foundations.md](sensor-phalanx-foundations.md).

Compatibility was checked against the actual pre-change `MissionFleet` struct
from `cfe36bccf8d80c77ed2897cb3e2a0bcde74aeb6c`, copied into a test fixture with only
the type name changed, and the exact old changed-fleet save statement. This is
not a dual-binary full-system test. It directly exercises the relevant serde and
PostgreSQL behavior: new fields are ignored on old deserialization; unchanged
old records are not saved; a changed record replaces the whole JSON and loses
`return_reason`. The test exercises the fleet-field changes used by old terminal
settlement, and an old-created active unknown return. Both writes succeed.
Startup/migration succeeds with unknown active returns and no journal evidence.
New fixture causes survive storage, export and bound-world loading.

Engine tests additionally classify real applied recall and failed-arrival
transitions, reject missing/stale/invalid/conflicting evidence without mutation,
and verify that new workers settle unknown returns at their existing deadlines
without inventing causes. Readiness then accepts their terminal state. Readiness
refuses incomplete membership, unexcluded old writers (even on an empty universe)
and active unknown deployment returns. The projection still refuses unknown
returns even when the supplied endpoints would otherwise be hidden.

## Validation

- `make test-phalanx`: 224 engine and 87 application checks passed. Final
  preparation: 0.75s and 0.10s; suites: 5.464s and 0.188s; wall time: 7.73s.
- `make test-db DB_SUITES='mission_return_reason migrations' DB_JOBS=2`: both
  compatibility tests and all 16 existing migration tests passed. Preparation:
  15.41s; suites: 3.838s and 11.816s; wall time including setup/cleanup: 30.44s.
  Each binary used its own disposable database and ran its tests serially.
  Parallel runner startup reported Cargo cache/build lock waits; these were not
  timed separately. No assertions, retries or deadlines were weakened.
- Final workspace Clippy with `orbit-server/test-support`, all targets and warnings
  denied passed: 14.24s Cargo time / 14.37s wall time.
- `make _static` passed formatting, lint, generated contracts and workspace/browser
  boundary checks: 11.16s. Final `cargo fmt --all --check` and `git diff --check`
  passed after the last test additions.

There were no failed validation attempts during this repair. Engine checks were
repeated as the evidence and natural-settlement assertions were added; no green
retry was used to dismiss a failure. PostgreSQL used the repository's pinned
16.10 image in dedicated Compose project `orbit-phalanx-rollout`, port 55439 and
an explicit unused subnet. Setup took 2.75s. No disposable test databases remained
at completion; the project's container, network and volume were removed in 0.33s.
Other services were unchanged.

No production data was accessed, no full-system or container acceptance test was
run, and no UI or screenshots were involved. No push, PR, merge or deployment was
performed. Queue/merge delay is not applicable.

## Activation limitations and handoff

The read-only evidence classifier performs no database lookup or backfill. Its
caller must supply authoritative, complete Applied journal evidence; it cannot
certify loader provenance or completeness. Its fixed typed error messages provide
actionable sanitized operator diagnostics without raw driver errors. Missing or
ambiguous evidence remains unknown.

The readiness helper is not yet wired to a live capability because this increment
has no scan command or enabled scan rules. Part 2 must implement the complete
loader, writer-exclusion proof and activation/scan-time enforcement under existing
serial/scoped rules barriers. A one-time preparation result must not be treated as
permanent readiness. The default rollout is ordinary rolling deployment with
scans disabled, followed by excluding old writers, allowing unknown active returns
to settle naturally (or explicitly classifying them), and checking readiness again
at activation. Unknown causes never justify either visible or silently omitted
scan rows. See the precise [activation contract](../architecture/sensor-phalanx.md#explicit-activation-boundary-for-parts-2-and-3).
