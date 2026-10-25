# High Scores

The initial High Scores screen ranks players by total completed-asset value in
their current universe. The selected scope is player search, paging, Around me,
public identity, and a compact read-only ranking detail dialog. There are no
alliance standings, bios, profile editing, messages or additional score categories.

The owner selected fresh snapshots on entry and explicit refresh on 2026-10-24,
superseding the historical G17 proposal for shared five-minute cuts. Each request
reads membership, names and asset lots in one PostgreSQL repeatable-read, read-only
transaction. It does not settle work, write totals, record presence, or use a
background snapshot publisher. After reading, the first request of a UTC day
records the source observation separately for historical rank comparisons. It exposes its sample time and whether due work
was still pending. This is a snapshot of committed state, not a claim that the
entire universe has settled through a particular logical deadline.

`value_completed_assets` remains the valuation owner. Ranking groups existing
lots by player, sums their exact paid values, then divides by 1,000,000,000 micro
units per point. The browser receives decimal point strings, never asset lots.
Equal displayed whole points share rank: 1, 1, 3. Canonical player UUID order makes
ties stable. Current members with zero points, vacation or inactivity remain in
the list; players without current membership do not. Asset values include ships
in flight and exclude balances, cargo, fuel and unfinished work.

`POST /api/v4/universes/{universe}/rankings` takes `QueryContext`, requires the
existing session/Origin/CSRF and membership/epoch checks, and returns `Rankings`
with `Cache-Control: no-store`. The response contains the full public roster so
50-row pages, case-insensitive substring search and Around me all use the same
observation. Filters preserve universe ranks. This choice avoids persisted derived
totals and page drift; it is not a capacity claim for large universes. Query cost
is proportional to current asset lots and the response to current members.

Names are the universe's account labels observed with the score snapshot.
Visible rows also use the existing current public-profile integration for names
and expiring supporter badges; those identities can refresh separately from
scores. Search uses the snapshot labels. A `Rankings` profile source accepts at
most 50 player IDs and resolves only current members of the bound universe. It
never exposes provider subjects, private account records or inventories.

The client retains one response in a screen-scoped Zustand controller. Search,
offset and selected player ID are local interactions; ranks and pages are not
stored separately. Refresh failure preserves the previous observation with an
error, while authentication/epoch changes follow the game session's existing
invalidation behavior. Request generations prevent abandoned or superseded
responses from replacing the list.

Validation lives in application ranking unit tests, the PostgreSQL `rankings`
suite (including HTTP authorization), client selectors/controller tests, and
`high-scores.spec.ts` browser fixtures. Run them through the existing Make/npm
entry points described in the project README.

## Daily rank movement

Movement compares the current response with the previous UTC calendar day's
first recorded observation. The exact timestamp is shown; this is deliberately
not labeled as a rolling 24-hour change or a midnight cut. If nobody opened High
Scores yesterday, or history has just started, movement is unavailable. New means
a current member was absent from a valid baseline. Zero means the shared rank is
unchanged, including ties. Positive values mean climbing toward rank one.

`ranking_observations` stores historical source facts: the observed member IDs and
asset lots, plus the observation timestamp. It never stores point totals, ranks,
or deltas. `value_completed_assets` and the same competition-ranking function
value and rank both observations on read. Former members remain in the historical
roster when computing historical ranks, but only current members are returned.
The private lot data never leaves the server. The public additions are
`baseline_at` and each member's nullable `previous_rank`; optional contract fields
allow an older server response to display an unavailable comparison.

The game read remains repeatable-read and read-only. A separate short transaction
inserts the daily observation with `ON CONFLICT DO NOTHING`; concurrent requests
cannot replace the winning observation. History is scoped by universe and epoch.
Each daily insertion prunes observations older than yesterday for that universe,
so there is no unbounded daily archive or new background scheduler. Inactive
universes keep their last observations until their next request. Recording does
not settle gameplay, admit commands or update activity. Read/record failures use
the existing refresh error behavior and retain the last complete client response.

The browser derives signed movement from the response. Search, paging and Around
me retain the global comparison. Table and detail indicators include accessible
text, visible signs, and distinct labels for missing history and new players.

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
