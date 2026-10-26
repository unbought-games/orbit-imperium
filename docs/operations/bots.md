# Identified machine players (S1)

Bots are publicly identified players. Their local accounts have no password or
external Accounts identity. They enroll through the same placement, player ceiling,
starting grants, engine, costs, queues, combat, visibility and protection rules as
human players. Explicitly marking an existing player preserves its account,
memberships, assets, command IDs and receipts. Names never determine identity.

## Upgrade and compatibility

This is a **coordinated upgrade**, not a mixed-version rolling deployment:

1. Stop every old API, worker and operator process. Drain connections, including
   retained/prepared SQL connections; a table rename does not invalidate every
   already prepared operation.
2. Take and verify a complete PostgreSQL backup, including the migration ledger,
   rules, commands, receipts, events, accounts and secrets. Record its cutoff.
3. Run the new binary's `orbit db-init`. Migration 0021 preserves existing data,
   renames the policy relation to `universe_policies_v2`, and adds disabled bot
   policy and participation records. No accounts are inferred or enabled.
4. Start only the new release's API/workers and matching web assets. Verify health
   and export the universe policy before enabling bots.

Pre-S1 production binaries cannot restart against this schema: their required
policy queries fail before API listeners or workers start. There is no legacy
compatibility view or fallback. `make test-bots` verifies a real pre-S1 binary in
API, worker and combined roles, first proving it starts before migration.
Binary-only rollback is unsupported. Restore the complete pre-upgrade backup into
an isolated database with the matching old binary; account for all post-backup
activity before making that restored deployment authoritative. Do not rename the
policy table back or remove ledger entries on an active world.

## Enable and provision

All new universes default to this policy extension:

```json
"bots": {"version": 1, "enabled": false, "max_active": 0, "action_units_per_24h": null}
```

Use ordinary revision-checked policy export/diff/apply:

```sh
orbit universe config export --universe "$UNIVERSE" --out policy.json
# Edit policy.bots: enabled=true, max_active=2, action_units_per_24h=100.
orbit universe config diff --universe "$UNIVERSE" --file policy.json
orbit universe config apply --universe "$UNIVERSE" --file policy.json
orbit bots create --universe "$UNIVERSE" --name Harvester --sleep-start-utc 00:00
# Creation prints the account/player/universe/epoch binding. Save the player UUID.
orbit bots token issue --universe "$UNIVERSE" --player "$PLAYER"
```

Keep the current worker running while enrolling into an existing world: ordinary
enrollment can wait for earlier accepted work affecting placement.

The allowance and cap are operator choices, not server defaults. Enabling requires
both to be positive. Creation atomically checks bot admission, the universe player
ceiling and physical capacity. Human signup may be closed while operator-managed
bot enrollment remains enabled. Sleeping bots occupy active slots. Retired empires
continue occupying physical space. Lowering the cap retires excess players newest
first, with an admission sequence breaking equal-time ties; affected identities,
reason and policy revision are audited. Disabling bots blocks participation without
retiring them unless the cap is also lowered. Re-enabling resumes unretired bots.
Unknown policy fields/versions fail closed.

`token issue` prints a random bearer secret once; only its SHA-256 digest is stored.
Tokens bind one account/player/universe, have no operator authority, and remain
valid until explicitly revoked. Multiple tokens share all usage and policy gates.
Issuing another token permits overlapping access. In S1
`token revoke --universe ... --player ...` revokes **all** that player's tokens;
rotate by stopping the runner, revoking, issuing a replacement and restarting.
Retirement leaves credentials usable for status and receipt recovery.

To migrate an existing known bot explicitly:

```sh
orbit bots mark --universe "$UNIVERSE" --player "$PLAYER" --sleep-start-utc 00:00
```

Marking is idempotent with the same schedule and preserves browser credentials;
the persisted player identity enforces limits for those credentials too. Changing
a marked player's immutable schedule conflicts. Schedules are UTC minute-of-day,
with an inclusive daily start and exclusive end exactly eight hours later,
including windows crossing midnight. There is no live schedule editing in S1.

## Authentication, observation and commands

Bearer authentication works independently of cookies, Origin and CSRF headers.
Invalid bearer credentials never fall back to a cookie. Browser cookie mutations
retain their normal Origin/CSRF checks. Use HTTPS outside explicitly local setups.

```sh
curl -H "Authorization: Bearer $TOKEN" \
  "$BASE/api/v4/universes/$UNIVERSE/binding?request_id=$REQUEST_ID"
curl -H "Authorization: Bearer $TOKEN" \
  "$BASE/api/v4/universes/$UNIVERSE/bot-status"
curl -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  --data-binary @query.json "$BASE/api/v4/universes/$UNIVERSE/world"
curl -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  --data-binary @command.json "$BASE/api/v4/universes/$UNIVERSE/machine/commands"
```

A galaxy query is the ordinary `WorldQuery4`:

```json
{"context":{"binding":{"account":"ACCOUNT_UUID","player":"PLAYER_UUID","universe":"UNIVERSE_UUID","epoch":"EPOCH_UUID"},"request_id":"REQUEST_UUID"},"type":"Galaxy","galaxy":1,"system":1}
```

`command.json` is `CommandEnvelopeV4`: protocol 4, the discovered binding, a durable
random `command_id`, and the normal command obtained from a quote. For example:

```json
{"protocol":4,"binding":{"account":"ACCOUNT_UUID","player":"PLAYER_UUID","universe":"UNIVERSE_UUID","epoch":"EPOCH_UUID"},"command_id":"COMMAND_UUID","command":{"type":"StartUpgrade","body":"BODY_UUID","building":"MetalMine","expected_terms_hash":"HASH_FROM_QUOTE"}}
```

The server atomically generates the ordinary planet-specific participation record,
including resolving cancellation/recall origins. Clients do not manufacture browser
gestures. The response is the normal 202 `BoundReceipt4`; engine rejection may occur
later. Poll the normal receipt route with the original epoch:

```sh
curl -H "Authorization: Bearer $TOKEN" \
  "$BASE/api/v4/universes/$UNIVERSE/commands/$COMMAND_ID?epoch=$EPOCH"
```

Persist command IDs and envelopes before sending. After response loss, retry the
identical envelope or read its receipt. Receipt recovery remains available during
sleep, disablement and retirement, without new cost or presence. Never replace an
uncertain command with a fresh ID. Binding/epoch mismatch and changed-payload
idempotency conflicts retain their ordinary semantics. A runner that normally
refreshes overview after a recovered receipt must defer that read while inactive.

## Capability and accounting matrix

Paths below are relative to `/api/v4/universes/{universe}/`, unless explicit.
This is the complete current web gameplay surface. Each future route must declare
its category and recovery contract before being exposed to bots.

| Capability | Machine path | Units per fresh logical operation |
| --- | --- | --- |
| Binding discovery | `GET binding?request_id=UUID` | 0; available inactive |
| Settings, topology, catalog/rules | `POST settings`, `POST catalog` | 0; available inactive; no live gameplay facts |
| Empire, production, queues, inventories, research, incoming/own fleets | `POST overview` | 0; awake only |
| Building/demolition/research/manufacturing and cancellations; production settings; rename planet; fleets, recalls, vacation; report read/hide/star commands | `POST machine/commands`, ordinary `CommandEnvelopeV4` | 1 at durable admission, including later engine rejection |
| Legacy browser command pair | `POST commands` | 1 for the pair, same identity allowance |
| Explicit foreground presence | `POST presence` | 1; awake and budget required |
| Progression inspection and quotes | `POST progression-options`, `POST quotes` | 0; awake only |
| Galaxy system | `POST world`, `type=Galaxy` | 1 per system; UUID-bound retained response |
| Coordinate/body/debris/empty-position resolution | `POST world`, `type=ResolveDestination` | 1 per coordinate, including observed absence/errors; retained replay |
| Fleet quote | `POST world`, `type=FleetQuote` | 0; awake only; coordinate-addressed destinations require a prior successful paid resolution |
| Reports/list/detail | `POST reports`, `POST reports/{report}` | 0; awake only; ordinary recipient visibility and page limits |
| Share report/revoke publication | `POST reports/{report}/share` | 1 per mutation; `context.request_id` binds payload and retained result |
| Share status | same path, `type=Status` | 0; awake only |
| Rankings | `POST rankings` | 0; awake only |
| Player profiles/Bot labels | `POST /api/v1/universes/{universe}/player-profiles` | 0; awake only; Galaxy source uses the same charged/replayed tactical query |
| Alliance directory, details, members, applications, board | `POST alliances/query` | 0; awake only; ordinary permission/page limits |
| Alliance create/join/apply/withdraw/accept/reject/leave/disband, settings, roles, members, posts and pins | `POST alliances/commands` | 1 per admitted mutation; ordinary `command_id` recovery |
| Combat simulation from supplied inputs | `POST combat-simulation` | 0; uses catalog and caller-supplied data, not live opponent intelligence |
| Observation updates | `GET updates?epoch=UUID` | 0; awake only; rechecked before delivery and at least once per second while idle |
| Receipts, bot status, voluntary retirement | `GET commands/{id}`, `GET bot-status`, `POST bot-retire` | 0; available inactive |
| Public shared reports, alliance pages and location cards | Existing anonymous/public URLs | Public information available anonymously; supplied valid bot credentials still obey inactivity gates |

A manufacturing order costs one unit regardless of legal quantity; independent
commands each cost one. Transport retries do not multiply cost. Existing report
pages remain bounded (maximum 100); profile batches maximum 50; galaxy requests
contain exactly one system. Alliance page and payload limits, command rate limits,
body-size limits and simulation concurrency limits are unchanged. Own-report
pagination does not create extra charges.

Enforcement applies to identified participation. The server cannot identify an
anonymous visitor or prevent unauthenticated reading of existing public pages.
Supplying valid bot credentials to those routes still applies inactivity gates.

Usage is derived from durable admissions in `(now − 24 hours, now]`. No banked
balance, midnight reset or token-specific budget exists. Commands and charges commit
atomically across replicas. Tactical observations retain the exact response (or
observed game error) under the player's binding, epoch, request ID and payload.
Eligible replay returns that observation, not refreshed intelligence; changing the
payload conflicts. Retained evidence is not a live-state cache. Replays remain free
after allowance exhaustion, but tactical replay is blocked during inactivity.

`bot-status` returns the binding, revision, complete bot policy, active/retired state,
retirement evidence, most recent sleep interval, used/available allowance and next
eligibility. Eligibility accounts for lowered allowances and sleep at the next
release time; null means disabled or terminally retired. It never records presence.
Stable 403 codes are `BotsDisabled`, `BotSleeping`, `BotBudgetExhausted`,
`BotRetired`, and `BotCapacityReached`; denials carry `next_eligible_at` where known.
Admission rejection costs zero. Free gameplay reads remain available after budget
exhaustion alone; sleep/retirement/disablement block fresh gameplay intelligence.

## Retirement and validation

```sh
orbit bots retire --universe "$UNIVERSE" --player "$PLAYER" --reason 'operator decision'
curl -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  --data '{"reason":"finished participating"}' \
  "$BASE/api/v4/universes/$UNIVERSE/bot-retire"
```

Retirement is terminal and idempotent; the first reason/time remains authoritative.
Only the authenticated bot can voluntarily retire itself. Retirement consumes no
allowance and works while sleeping or exhausted. Already accepted work still
settles, including its accepted participation evidence. New participation/presence
refresh stops; login, technical polling, hostile contact and returns do not extend
ordinary last-presence time. Production and abandoned empires remain ordinary world
state. Rejoining requires a new player and ordinary admission/grants.

Focused tests: `make _db-bots`, normal Rust tests and `npm test -- player-name.test.ts`.
Full scenario: `make test-bots` (explicit only, never routine CI). It builds a real
pre-S1 production binary, migrates a disposable database, starts the current HTTP
server and worker, creates two bots, compares human grants/costs, checks labels,
spends allowance, crosses sleep boundaries, recovers a lost response, retires a bot,
and verifies paid construction settlement without new presence. The harness reports
phase timing, source revision and database cleanup. PostgreSQL must already be
available in the disposable test environment; it creates/drops only its own database.

S2 population maintenance/shared cleanup, S3 lifecycle personalities, the bot lab
and bot strategy/client implementation are not part of S1. Retained bot usage and
query evidence currently have no automated purge; plan retention separately without
breaking command/query recovery or rolling-window enforcement.
