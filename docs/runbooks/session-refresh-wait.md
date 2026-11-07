# Concurrent session refresh

An authenticated request encountering another request's active OIDC rotation may
wait up to 500 ms to re-read the authoritative PostgreSQL session. The existing
four-second total authentication deadline and two-second provider deadline remain.
A successful peer uses the persisted identity; it does not call the provider again.

Waiting releases database connections and transactions. Retries back off from
25 ms to 200 ms, with a fixed deadline that retries never renew. Each store shared
by an API process admits at most 64 waiting requests and eight per session.
Cancellation releases its slot. No identifiers or token values are logged.

An exhausted wait/capacity limit still returns `SessionRefreshing`, HTTP 503,
`Retry-After` and `no-store`. Invalid or expired claims still require sign-in.
Logout/expiry cannot be undone by a late refresh. The old refresh capability is
still removed before provider work and cannot be replayed after cancellation.
Player commands are not resubmitted: this only coordinates authentication for
the original request before admission.

The read-phase auth histogram includes the peer's wait and final outcome. Internal
read attempts are not HTTP response counts; do not subtract auth counters from
proxy 5xx counts. A successful wait is not a failed HTTP response. Residual 503s
remain real failed requests, even when clients can subsequently recover.

## Validation

`make test-db DB_SUITES=oidc DB_JOBS=1` covers real PostgreSQL, independent store
instances with one connection per role, one provider rotation, responsive
unrelated sessions, successful peers, waiter cancellation, late logout, expired
claims and timeout/refusal. The held provider is released by explicit channels;
waiter admission is observed directly instead of guessed with sleeps.

The private wait-limiter unit tests cover per-session/process exhaustion and
capacity cleanup. Run `cargo nextest run -p orbit-storage-postgres --lib
--features test-support -E 'test(oidc_wait::)'`, formatting, and the storage
crate's all-targets clippy checks. Browser behavior and HTTP error contracts are
unchanged. Production acceptance additionally requires retained-session checks
across natural expiry, the same immutable API/worker image, and observed HTTP/auth
intervals; green smoke checks alone do not attribute historical requests.
