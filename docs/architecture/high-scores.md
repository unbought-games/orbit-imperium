# High Scores

The initial High Scores screen ranks players by total completed-asset value in
their current universe. The selected scope is player search, paging, Around me,
public identity, and a compact read-only ranking detail dialog. There are no
alliance standings, bios, profile editing, messages or additional score categories.

The owner selected fresh snapshots on entry and explicit refresh on 2026-10-24,
superseding the historical G17 proposal for shared five-minute cuts. Each request
reads membership, names and asset lots in one PostgreSQL repeatable-read, read-only
transaction. It does not settle work, write totals, record presence, or use a
background snapshot publisher. It exposes its sample time and whether due work
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
