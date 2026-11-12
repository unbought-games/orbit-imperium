# Cancelled transaction opening

Base: `90ad873169e6b99d30f1b41830e067315b2f5e1f` (SQLx 0.8.6).

PostgreSQL can execute BEGIN before SQLx increments its local transaction depth.
If the caller drops that pending future, the driver's rollback guard sees depth
zero. A later borrower can inherit an open transaction, and a later request to
set isolation fails with SQLSTATE 25001 after a query has established a snapshot.

The correction completes only the native BEGIN handshake in a Tokio task holding
an already acquired pool connection. If its caller disappears, the unclaimed
native Transaction is dropped after completion and queues the normal rollback.
No application query runs in that task. Once returned, transaction ownership,
commit and rollback remain with the caller. All store transaction-opening paths,
including analytics and migration checks, use this boundary. There is no added
SQL query on normal returns and no change to connection reservations or timeouts.
This establishes a mechanism, not attribution of every historical server error.

## Regression boundary

The PostgreSQL test uses a session advisory lock to stop a custom BEGIN command
at the same driver response await as ordinary BEGIN. It observes the backend
waiting before cancelling; no sleep chooses the race. Other pool slots are held
so a new connection cannot hide the result. After releasing the gate, the test
requires the same backend to accept REPEATABLE READ READ ONLY, then verifies that
committed work survives and dropped unfinished work rolls back. Both role-reserved
and shared-store constructors are covered. The lock statement is a test-only
response gate, not production transaction SQL.

Replacing the protected handshake with the original direct await makes this
actual-store regression fail with 25001. Restoring the implementation passes.
An initial cleanup prototype also passed but was replaced before publication to
avoid an additional rollback command on every normal pool return.

## Validation

- Rust 1.99.0; `cargo fmt --all` and `git diff --check`.
- `make test-db DB_SUITES='pools server_guard oidc analytics migrations' DB_JOBS=1`:
  36 tests passed; one existing explicit real-provider acceptance test remained
  intentionally skipped. Disposable PostgreSQL only, no production database.
- Final focused setup/compile 4.07 seconds. Execution: pools 0.246s, retained
  server fence 1.248s, OIDC 6.724s, analytics 0.593s, migrations 9.923s.
- `cargo clippy -p orbit-storage-postgres --all-targets --features test-support
  -- -D warnings`: initial lint found the helper after the test module; it was
  moved before the module and clippy rerun. No lint was disabled.

The first authored shared-pool fixture allowed a second idle slot, so SQLx could
open another connection while returning the cancelled one. Its same-backend
assertion failed. This fixture's one repair reserves all other slots. The repaired
fixture passes and detects the original product defect deterministically; no
assertion, functional timeout or test was removed. No earlier history exists for
this new test; the test repair ledger was checked. No UI changes; visual
validation is not applicable. Remote CI and production verification are separate.

## First PR CI result

The first PR head's build and journey jobs both stopped at news generation because
the new change note omitted required YAML frontmatter. No browser assertion
failed. Added the existing required id/title/date fields and verified the news
build (34 local updates) plus tooling tests locally (130 passed, one existing skip). This authored build-note defect is separate
from the PostgreSQL cancellation regression; no check or assertion was weakened.
