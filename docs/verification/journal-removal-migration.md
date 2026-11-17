# Final journal removal migration

Migration 0051 is the second stage after the journal-independent bridge in #451.
It uses a two-second lock acquisition limit and `DROP TABLE ... RESTRICT`.
It changes no gameplay, receipt, event, delivery or analytics retention policy.
Published migrations and legacy unmanaged-schema fixtures are unchanged.

The coordinator must verify every production writer uses the bridge before
deploying this bundle. Keep a bridge-capable rollback image and the identified
existing recovery point. Do not deploy a journal-dependent image after removal.
This source document does not claim production activation or reclaimed bytes.

## Verification

- The PostgreSQL migration test runs the real prefix through 0050, retains an
  account, and adds an external view dependency. The attempted removal fails
  with SQLSTATE 2BP01 without advancing the ledger. Removing that test-owned view
  permits upgrade; repeat migration and the older bridge bundle preserve history.
  All earlier migration checksums and retained data match. A fresh install ends
  without the journal.
- The serial/scoped execution matrix still checks table-present no-write
  compatibility and table-absent retries. Because fresh installs now drop the
  table, its table-present case recreates only the historical table from the
  published CREATE as a disposable test fixture. Supported prefix/ledger
  upgrade is tested separately, not simulated by changing migration checksums.
- That matrix also applies the exact removal SQL over actual game state,
  terminal receipts and newly accepted construction. Retained rows are identical
  across removal; original requests return their receipts after restart, and the
  accepted scheduled construction completes once at its deadline.
- Existing absent-table bootstrap, legacy mission-return and explicit recovery/
  capacity setup now tolerate an already absent table. Production migration 0051
  remains strict; no CASCADE or silent dependency removal is introduced.

Local PostgreSQL 17.7: 26 tests passed across journal_independence, migrations,
bootstrap and mission_return_reason. The strengthened gameplay/drop matrix then
passed again in 8.290 seconds. No failing test was removed or assertion weakened.
Full release and production verification remain with the coordinator.
