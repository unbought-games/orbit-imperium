# Alliance attacks validation

Validated November 1, 2026. Implementation revision:
`62fa5e05618f55d4d7943c7e5e578c4bb90a7a04`, based on
`398aa2fafab9f8031cd584f2023aff7ddd582e01`. The implementation was tested in the
working tree and then committed without changing source. This record is a later
documentation-only commit.

Scope: invitation-based group attacks, synchronized arrival and recalls,
multi-attacker combat against held defenders, pooled loot, individual returns,
recipient projections, simulator contingents, migration 0029, standard content
0.15.0, audit and scenario-export handling, and desktop/mobile flows.

Toolchains: Rust 1.99.0, Node 24.18.0, npm 11.16.0; PostgreSQL 16.10 from the
repository's pinned Compose image. Logs are retained locally in the ignored
`test-results/alliance-attacks/validation/` directory.

## Passing checks

| Check | Result | Measured execution |
| --- | --- | --- |
| Tooling in `make check` | 116 passed, one existing explicit-only Compose-isolation test skipped | 10.625 s |
| Client Vitest | 1,278 passed across 131 files | Final run 6.76 s |
| Native engine/application/server/transport suite | 619 passed | 24.543 s |
| Configuration bridge | 43 passed | 0.802 s |
| PostgreSQL library | 7 passed | 0.011 s |
| Final focused application coverage | 111 passed, including disabled capability projection | 0.247 s |
| Final group engine coverage | 7 passed, including added first-round privacy and inline-recall cases | 0.088 s |
| PostgreSQL group journey, serial and scoped | Passed, including final mixed-technology/loot assertions | 10.039 s; compilation 1.70 s |
| PostgreSQL holding journey | Passed | 14.119 s |
| PostgreSQL migrations and selective query plans | 16 passed | 14.200 s; query-fix rerun also passed all 16 in 8.748 s |
| PostgreSQL bot/API coverage | 10 passed | 7.721 s |
| PostgreSQL world coverage | 3 passed | 13.098 s |
| PostgreSQL rules updates after environment recovery | All 40 passed | 253.050 s |
| Browser regression: groups, simulator, Dispatch, reports, sharing, HUD | 183 passed | 3.1 min |
| Final recall copy and captures | Both viewport journeys passed again | 4.6 s |
| Additional invitation/incoming/HUD browser coverage | Both viewport journeys passed | 2.5 s |
| Clippy with warnings denied | Passed; final test additions checked | 0.81 s final incremental check |
| rustfmt, ESLint, Prettier, generated contracts, boundary checks | Passed | Native runner logs retained |
| Production frontend and SSR build | Passed | Vite 6.20 s; SSR 1.11 s |

The full check passed before the final projection/copy refinements. Focused
application checks, all client tests, static checks, build and affected browser
journeys cover those refinements. The two final group engine tests extend the
original full native run rather than replacing it. No failed or interrupted run
is counted as successful validation.

## What the tests prove

The database journey uses real storage and the production application/engine in
both runtime modes. Unrelated players create/invite/join, revoke future access
without ejecting a committed fleet, launch a held defender after scheduling the
group, restart storage, resolve one battle and deliver one report to each of four
players. Attackers retain Weapons Technology 3 and 7 separately. Their 16,000-unit
pooled haul is allocated exactly across the personal return manifests, and all
attacking returns finish at their individual deadlines. Current-state and
scheduler audits pass with an active group and after resolution.

Engine coverage checks exact 30% boundaries, repeated-delay arithmetic, active
fleet and distinct-owner caps, missing membership facts, unauthorized and blocked
invitations, initiator recall, retained delay, uncapped elapsed recalls, immediate
same-time return, stale group events, one battle, and first-round ContactLost.
Existing combat/holding tests remain in the native regression suite. Pooled
capacity arithmetic also covers totals above one fleet's signed resource range
without widening spendable manifests or violating conservation.

Projection tests exclude nonrecipients and other members' cargo, technology,
return details and invitation lists. Simulator tests preserve separate technology
and mobile-unit restrictions and enforce the total unit limit across contingents.
Client tests reject changed group revisions and expired joins without duplicating
game state. Browser tests exercise re-quotation after a group changes while
preserving ship edits, role-dependent invitation controls, incoming intelligence,
private returns, and result invalidation after simulation edits.

## Failures found and resolved

- Initial local Cargo selected Rust 1.97.1; validation used the pinned rustup
  toolchain. Node/npm validation likewise used the pinned local versions.
- Early group fixtures violated investment/protection or prepaid holding-fuel
  capacity. Fixtures now use valid paid asset edits and affordable hold durations;
  the production guards and assertions remain unchanged.
- Extending the main fleet query with an additional member-ID predicate broke its
  selective plan (209 buffers versus the existing under-100 assertion). The final
  loader preserves that query and loads only missing group members by primary key
  separately. The original performance assertion passes.
- Browser tests exposed a join-button guard reading the submitted envelope rather
  than its quote. The corrected selector has a dedicated current-revision and
  expired-window regression test. Fixture payload/locator errors were also fixed.
- The standard-upgrade test expected release 0.14.0. It now expects 0.15.0 and
  explicitly verifies that preview leaves group rules absent and apply enables
  the versioned profile.
- The host disk filled during follow-up compilation, interrupting a rules suite
  and a browser regression run and stopping Docker. Only this checkout's generated
  compiler incremental cache was removed. Docker recovered through its official
  CLI. Interrupted suites were rerun: all 40 rules tests and all 183 browser tests
  passed. Later validation disabled incremental compilation locally to avoid
  repeating the storage pressure; repository CI settings were not changed.
- Visual review aligned allied simulator fields with the existing fieldset styles
  and made invitation status readable beside the player's name. Group recall
  review explicitly explains that synchronization delays count toward the return.

## Visual review and cleanup

Captured and inspected the running implementation at 1440×900 and 390×900:
fleet creation, invitation management, joining Dispatch, shared-arrival review,
recall review, closed group, recipient invitation/incoming views, invitation HUD,
combat returns, simulator contingents and simulator results. Capture names contain
screen/state and viewport dimensions in `test-results/alliance-attacks/`.
Affected captures were refreshed after UI changes. Full-page captures include the
application's existing fixed HUD/navigation; browser journeys also exercise the
actual controls. Images are delivered in the implementation chat, not hosted for
a pull request.

The isolated Compose project was `orbit-alliance-attacks`. The failed disk-pressure
run left one disposable test database when Docker stopped; it was explicitly
removed after recovery. Before final shutdown the project contained no
`orbit_test_*` databases. Its container, network and volume were then removed.
Browser runners closed their Vite servers and Chromium processes. Source, ignored
logs and captures remain. No production deployment, universe activation, CI
schedule change or routine execution deadline was introduced.

Activation instructions are in [Alliance attacks](../operations/alliance-attacks.md).

## PR 294 recall-history review

Review comment 4436155185 claimed returned recalled fleets disappear from group
facts, preventing later joins or hiding the group after the initiator returns.
Inspection found that mission records are retained: terminal return updates the
fleet leg, persistence upserts the record, and the world loader explicitly fetches
missing group members by ID without filtering out terminal legs. Group membership
is historical; active participation is derived from the fleet leg.

Revision `4e8a05c444aee9b321cc7612b5db1c8ddf14da72` adds a real PostgreSQL regression
in both runtime modes. A member recalls, lands before group contact, survives a
storage reopen, and can launch a new fleet into the group. The initiator then
recalls and lands; another storage reopen still exposes the group to both players,
with one active member and joining correctly closed. Audit passes and the remaining
fleet resolves exactly one battle. No production behavior or UI change was needed.

The first test draft attempted to authorize a new fleet quote using a viewer-only
snapshot and correctly received PolicyUnavailable. It now uses the production
FleetQuote loader, retaining the expected AttackGroupClosed assertion. The full
`make _db-attack_groups` binary passed both tests in 19.162 s (compilation 1.57 s;
new regression 9.263 s). Focused Clippy with warnings denied passed in 0.43 s.
The runner removed both disposable databases; the isolated `orbit-alliance-pr-294`
Compose container, network and volume were removed after confirming no test
databases remained. Existing UI captures remain current.
