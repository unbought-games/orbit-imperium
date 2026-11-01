# Public universe API verification

Implementation revision: `1a620a00385b49282aeeaafe659255fe0f1b8ad1`.
The verification record is a subsequent documentation-only commit. No UI changed;
visual validation is not applicable.

| Check | Result | Wall time |
| --- | --- | --- |
| `make check` on the committed implementation | Passed: 116 tooling tests, one explicitly enabled Docker isolation test skipped; 1,237 client tests; 582 workspace tests; 43 bridge tests; 7 storage unit tests; Clippy, formatting, lint, contracts, architecture checks and production build | 63.52 s |
| `make -j2 _db-public_universe _db-rankings _db-migrations` | Passed: 2 public feed scenarios, 2 ranking scenarios, 16 migration scenarios | 23.41 s including compilation |
| Public feed PostgreSQL execution | Both scenarios passed | 3.786 s |
| Ranking PostgreSQL execution | Both scenarios passed | 3.748 s |
| Migration PostgreSQL execution | All 16 scenarios passed | 8.575 s |
| `git diff --check` | Passed | Under 1 s |
| Disposable Compose cleanup | Removed container, network and volume | 0.27 s |

The PostgreSQL run tested the exact source committed in the implementation
revision. The final `make check` ran with that revision checked out and a clean
working tree. Rust 1.99.0, Node 24.18.0 and npm 11.16.0 were used. The shell first
selected an older Rust installation and rejected the workspace's minimum version;
validation used the pinned installation after correcting PATH, without changing
repository requirements.

The public-feed scenarios use a controlled database clock. They cover anonymous
HTTP access; strict top-level, player, alliance and planet allowlists; zero-point
players and score/rank parity; credentials and query parameters preserving the
same observation; conditional GETs and CORS; availability limits; hourly/daily
boundaries; bounded retries and recovery; independent feed joins; atomic
publication; expired claim fencing; reset epoch invalidation; and byte-equivalent
source data in every non-publication table before and after reads/publication.

The failure scenario injects a PostgreSQL trigger that rejects the observation
write after claim release. Both writes roll back and the previous complete
observation remains served. Corrupt source facts similarly preserve the prior
publication and exhaust that boundary's retry budget. Source tests additionally
prove uncommitted score/name changes are invisible and committed changes appear
together. Moons are excluded; planet replacement at the same coordinates retains
a distinct identity, and owner/name changes wait for the next planet publication.

One initial integration fixture attempted to name a moon, which violated the
existing `planet_name_valid` database constraint. The fixture was corrected to
use an unnamed moon, retaining the exclusion assertion; the affected suite was
rerun successfully. No validation timed out and no assertions were weakened.

PostgreSQL used disposable Compose project `orbit-public-api-1f46`, with allocated
host port 55052. Make's existing runner created a distinct database per test
binary and kept each binary serial. A query before cleanup found no remaining
`orbit_test_%` databases. `docker compose down --volumes` removed only this
project's resources. No full-system acceptance, deployment, signup journey,
process recovery or production-container validation was performed.
