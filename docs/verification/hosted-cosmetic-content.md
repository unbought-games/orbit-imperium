# Hosted cosmetic content verification — 2026-10-31

Application code revision: `01c485098648c33f4d1cd7f9a91fa9acfc7fc4d4`.
Branch: `emick/hosted-cosmetic-catalog`. Later documentation commits do not change
implementation. No application deployment or public PR was performed in this task.

## Routine checks

Final `make check` on the committed code passed:

| Phase | Result | Measured execution |
| --- | --- | --- |
| Tooling | 113 passed, including public cosmetic distribution guard | 5.184 s |
| Client | 1,174 passed across 123 files | 3.13 s |
| Server/engine/application | 578 passed | 27.226 s |
| Compatibility bridge | 42 passed | 0.986 s |
| Storage library | 7 passed | 0.014 s |
| Clippy, format, lint, contracts, boundaries | Passed | Native runner output retained locally |
| Production frontend | Passed | Client build 3.38 s; SSR 0.290 s |

`make _db-insignias` on the committed code passed its PostgreSQL/HTTP integration
scenario (4.02 s preparation, 5.013 s test). It covers actual catalog-driven
writes, grants, supporter observations, missing-item preservation/restoration,
authenticated external media, anonymous denial, unlisted objects, immutable older
revisions, both legacy profile formats, and old-editor compatibility.

The final fixture browser run (`ORBIT_TEST_SCREENSHOTS=1 npm run test:ui --
insignias.spec.ts`) passed all nine tests: module preparation 2.921 s, runner
18.9 s. The preceding combined run also passed all three player-profile tests
(12 total, 21.7 s). Frontend bytes did not change afterward. Captures at 1440×1000
and 390×1000 were inspected for community, supporter, missing-content and recovery
states. A blank missing-symbol preview was corrected and affected captures refreshed.
Screenshots remain local under `test-results/`, displayed in the originating chat.

## Explicit real-server check

`COMPOSE_PROJECT_NAME=orbit-hosted-catalog ORBIT_TEST_DB_PORT=55013 make
_db-insignias test-insignias-live` passed against a native Rust server, isolated
PostgreSQL database and temporary asset directory. It installs a freely licensed
fixture catalog independently of the binary, then saves/equips a design, observes
Galaxy identity, reloads, restarts the API and verifies the retained selection and
media delivery. No proprietary original is used by public tests.

Measured phases: preparation 30.680 s; browser 7.625 s; restart 2.070 s; cleanup
0.201 s; total 40.577 s. The subsequent authentication-error response adjustment
was verified by the final committed PostgreSQL scenario and complete `make check`.

The live script removed its database, server/browser processes and asset directory.
The database harness removed its test database. A final pg_database query found
no test/live insignia databases; the scoped Compose project, volume and network
were removed with `docker compose down -v`.

## Private publication and infrastructure

The owner-authorized private hosted-content repository was created, checked as
PRIVATE, and pushed. Its five tests, deterministic build and GitHub CI passed.
The exact legacy hosted SVG and pinned manifest were published into the existing
private S3 bucket and read back byte-for-byte. The infrastructure helper verified
the manifest hash, then merged the catalog key into the existing official Orbit
configuration with supporter policy and unrelated values preserved. No credentials
were printed or committed. No new cloud resources or permissions were introduced.

Infra code revision: `2e615f4bd3ba1dd781e22c512a55986dd72e2898` (separate isolated
worktree). Its runtime suite ran 58 tests in 3.902 s: 56 passed and two existing
explicit credential/Linux checks skipped. `make init` passed. `make validate`
passed every Terraform root and website routing, then failed at the retired Fly
check because a Fly login is unavailable. No Terraform apply was needed/performed.

Production Orbit readiness remained HTTP 204 after publication/configuration.
The running old binary was not restarted. The new content-loading behavior starts
with a future controlled release of this application code. Private deployment
pins, source history and exact publication evidence are recorded in hosted-content
and the infrastructure handoff, outside the public application repository.

## Failures encountered and resolved

- An early ad hoc Rust command incorrectly requested an orbit-server library
  target; that package is a binary. The required Make checks exercise it correctly.
- Initial Clippy found a compatibility helper after a test module; it was moved
  before the module and final Clippy passed.
- Infrastructure's retired Fly login check remains unavailable as described above;
  this is not claimed as a passing aggregate infrastructure validation.
