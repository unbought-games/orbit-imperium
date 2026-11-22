# High Scores

High Scores ranks current players and alliances by the value of completed assets.
The API reads one compact row per player in a repeatable-read transaction.
Opening the page and pressing Refresh both read the current committed standings.

## Current scores

Each player's `current_score_micro` is the exact sum of quantity times paid unit
value across their asset lots. Inventory commits write that absolute value in
the same transaction as the lots. A player who loses their last asset scores
zero. A change in location preserves paid value. Resources, cargo, fuel and
unfinished work are excluded. Asset lots remain the authority for rebuilding
the score.

Existing players can have an uninitialized score during an upgrade. The online
backfill only writes rows that remain uninitialized, including when gameplay
commits concurrently. Rankings become available when every current member has
an initialized score. The [operator guide](../operations/high-scores.md) covers
rollout, retry, capture and monitoring.

One displayed point is 1,000,000,000 micro-units. The API computes alliance totals
and averages from the exact values of their current members before rounding
down. Equal whole points share a rank (1, 1, 3), with UUID ordering for stable
display. Members with zero points remain ranked. Alliance summaries and the
hourly public player feed use the same scores and ranking rules.

## Daily rank movement

A worker captures standings independently of page traffic on the first
successful run each UTC day. A snapshot records the universe and epoch, actual
sample time, and the ID, exact value and rank of every current player and
alliance. Workers and the manual operator command share the same unique daily
key. A retry preserves the completed observation.

Movement compares live rank with the newest snapshot from an earlier UTC day.
A late capture uses the real time it ran. When a day is missed, the previous
available snapshot supplies the comparison, with its date visible on the page.
The two latest completed captures cover today and the preceding available day.
A missing baseline shows unavailable movement. A missing member of a valid
baseline shows New. Historical alliance ranks retain the memberships at capture.

## Request and presentation

`POST /api/v4/universes/{universe}/rankings` keeps the existing session,
Origin, CSRF, membership and epoch checks. Its no-store response carries the
sample time, queued-work indicator, player and alliance rows, baseline time
and previous ranks. Asset lots and private rosters stay on the server.

The page retains the response in its screen-scoped controller. Search, 50-row
paging, Around me and switching between players and alliances operate on this
observation. Filtering preserves global rank. Visible player details use the
existing scoped public-profile source. A refresh failure preserves the last
complete response. The [database suite](../../crates/storage-postgres/tests/rankings.rs)
covers the read and history boundaries.

## Validation record — 2026-10-24

Implementation source: `6df301306fe269f070dc1428d824c870596d0d8f` on
`emick/high-scores`, based on `b54dea8`. The final UI navigation change is
`c59c0dd7c09d01594cecd7b45297b7ac3c89946b`; only the High Scores component, styles
and browser assertions changed in that follow-up. Checks run while developing
used the source subsequently captured in those commits. The full browser run
finished with the first implementation commit checked out and clean. The final
UI source was rechecked with its targeted browser tests, build and static checks.

| Check | Result | Wall time |
| --- | --- | --- |
| `npm test` | 661 passed across 69 files | 3.40 s |
| `make test-server` | 312 workspace, 32 bridge and 7 storage unit tests passed; preparation included | 107.23 s |
| `make _db-rankings` | 1 PostgreSQL/HTTP integration test passed | 6.02 s (2.44 s compile, 2.33 s test) |
| `make -j2 _db-player_profiles _db-public_player_names` | Both existing identity integration suites passed | 53.01 s including compilation/lock waits; tests 4.85 s and 6.74 s |
| `make test-tooling` | 85 passed, 1 explicitly enabled Docker isolation test skipped | 6.19 s |
| `npm run test:ui` | All 397 fixture browser tests passed | 230.50 s |
| Final `npm run test:ui -- high-scores.spec.ts` | Both tests passed, including focus and viewport assertions | 4.56 s |
| Final `npm run build` | TypeScript and production Vite build passed | 7.26 s |
| Final `make _static` | Formatting, lint, generated contracts and architecture boundaries passed | 6.85 s |
| Workspace Clippy with test-support and `-D warnings` | Passed | 11.14 s |

Visual inspection covered 1440, 390 and 320 pixel screenshots; browser overflow
assertions additionally covered 768 and 360 pixels. Tests include large exact
point totals, long names, tied ranks, filtered global ranks, paging, Around me,
keyboard focus restoration, refresh failure, initial errors and empty results.

Failures corrected before the passing runs:

- The existing exact navigation list omitted the new destination; its expected
  list now includes High Scores.
- A ranking request failure incorrectly set the gameplay connection stale;
  transient failures now stay local, with authentication and epoch invalidation
  retained. Browser failures initially reported the resulting duplicate alerts.
- The architecture source check matched an injected callback named `fetch`;
  renamed it `load`, retaining all HTTP access in the adapter.
- The database test assumed starter assets had a nonzero score. Replaced that
  assumption with an explicit uncommitted/committed six-point lot fixture and
  verified the exact zero-to-six transition.
- Visual review found large point totals wrapping on narrow screens. The final
  mobile style keeps them on one line without page overflow.

No validation timed out. PostgreSQL used the isolated Compose project
`orbit-highscores-0868` with a dynamically assigned host port (55008); each test
binary created and removed its own database. A final query found no test databases
remaining. `docker compose down --volumes` removed the project's container,
network and volume in 0.54 s. Browser runners stopped their temporary Vite
processes. No full-system acceptance, production-container validation, deployment,
push or merge was performed.

## PR #83 review follow-up

Source revision `865c790752e5a68ea9c837c3a3c032ebd40ddf84` fixes detail-dialog
cleanup. A browser regression reproduced loss of useful focus when an already
pending ranking refresh removed the selected player. The selection also needed
clearing so a later snapshot could not reopen the dialog without a new gesture.
Ordinary browser-back navigation was already usable in Chromium; the regression
retains coverage for it rather than claiming that case failed.

The dialog now closes its native modal during layout cleanup. If the selected
player disappears, the local interaction selection clears and focus returns to
the ranking table. Normal Close/Escape still restores the opener, with a table
fallback if that element has gone away. Queued close events from effect replay
cannot dismiss a reopened dialog.

The new browser test failed before the fix (10.23 s including all four selected
tests). After the repair, all four High Scores browser tests passed in 7.50 s;
661 client tests passed in 4.46 s, static checks in 7.69 s, and the production
build in 7.57 s. The browser runner cleaned up its temporary Vite process. No
additional database or Docker resources were started for this UI-only repair.
