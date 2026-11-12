# Retained refresh cancellation

Baseline: `19f6450a9f752499bf6dbc6e8f0a1945108d2e7f` plus the new regression.
Changed boundary: PostgreSQL OIDC revalidation, after admission to the reserved
refresh pool and before writing its durable rotation claim.

The durable claim removes the old refresh capability before contacting the
provider. That prevents replay after ambiguity but does not keep caller-owned
provider/persistence futures alive. Aborting the caller previously stranded a
usable session even when the provider and database could complete normally.

Admitted rotation now runs in a Tokio task that owns the reserved connection.
Cancellation drops only the waiting handle. The existing absolute four-second
revalidation deadline and two-second provider deadline remain unchanged. Capacity
is acquired before spawning, so surviving work is bounded by the existing refresh
pool. Cached reads and peer waiting stay caller-owned. Non-rotating activity
renewal also stays caller-owned and releases its capacity promptly on cancellation.
Both rotation transactions retain the same connection across the durable claim.

The task does not retry consumed tokens, restore failed sessions, or recreate a
row deleted by logout/expiry. Real provider ambiguity, persistence failure,
deadline expiry and process loss can still require a new sign-in. This correction
does not retrospectively identify the request that interrupted a historical session.

## Regression and acceptance

`cancelled_caller_keeps_provider_and_persistence_rotation_alive` uses a real
isolated PostgreSQL store. A controlled provider response tests cancellation after
the committed claim. A held account row and observed PostgreSQL lock wait test
cancellation during persistence. After caller cancellation, a peer must reuse the
one completed rotation without invoking the provider; the retained session and
new refresh token remain usable and the claim is gone. No sleeps or retry-based
assertion stabilization are used.

The provider case fails against the unchanged baseline with
`caller cancellation must not drop the admitted provider request` (0.524 seconds;
initial compilation 88 seconds). With the correction, the complete OIDC binary
passes 14 tests in 7.001 seconds after 8.63 seconds of compilation. Its one existing
explicit-only real-provider scenario remains skipped by the routine configuration.
The fixture owns cloned provider configuration/client values for the new task
lifetime; no provider assertions were weakened.

The previous cancelled-owner case expected a stranded claim. Its cancellation
schedule is now covered by the positive survival regression; the existing logout
test covers both a waiting and a cancelled caller and verifies no resurrection
after the admitted worker releases its capacity. Existing ambiguous-response and
failed-commit scenarios continue to prove no replay. Peer capacity, logout/expiry,
activity renewal, metadata, enrollment and cross-replica tests remain enabled.

An initial setup invocation preceded PostgreSQL readiness and failed in createdb
before running any test. It was repeated only after Docker reported healthy.
The first compile of the correction identified borrowed test-closure captures;
those captures now own their values. Neither was a test assertion defect, and no
test was removed to make the suite pass. Local fixtures use no production data.

Rust1.99 formatting, diff checks and scoped Clippy with warnings denied pass
(35.83 seconds). The change note passes the actual news parser. The disposable
PostgreSQL container was stopped after verification; its isolated volume remains.

CI, trusted image publication, deployment and live retained-session observation
are separate acceptance steps and remain pending at this commit. No schema,
access-policy, resource-budget, token replay or destructive recovery change is
part of this correction.
