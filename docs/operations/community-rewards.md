# Community rewards integration

Community rewards are optional. Unconfigured standalone servers keep local accounts,
installed free content, and their chosen cosmetic access policy. Enabling
`unrestricted` never contacts an official service or creates official awards.

Participating deployments configure a trusted Accounts OIDC issuer and two
independently provisioned credentials:

- `ORBIT_ACCOUNTS_REWARDS_DEPLOYMENT_ID`: the registered stable deployment identity.
- `ORBIT_ACCOUNTS_REWARDS_CREDENTIAL`: outbound game service access.
- `ORBIT_ACCOUNTS_REWARDS_CALLBACK_CREDENTIAL`: inbound Accounts callback access;
  it must differ from the outbound credential.
- `ORBIT_ACCOUNTS_REWARDS_URL`: optional service origin, defaulting to the configured
  issuer with `/api/auth` removed. HTTPS is required. Explicit
  `ORBIT_ACCOUNTS_REWARDS_ALLOW_HTTP=1` permits loopback test origins only.

Keep these values in the deployment secret store. The existing public-profile
credential has no reward authority. Configure the same outbound issuer/credential
on API and worker roles. Workers do not need browser sessions or a player online.
Normal `db-init` applies migration 0044; no network calls occur in migration.

## Evidence and recovery

Successful human progression and strategy commands record real UTC participation
in the same transaction as their game changes. The date comes from the durable
server-assigned command time, so recovery after midnight preserves the original
date. Rejected commands, bots, polling, automatic arrivals and passive production
never create participation. Each account has one outgoing game/date fact, while
local universe facts retain alliance evidence.

Opening briefing completion means every objective in the pinned
`colony-opening-v1` program: the colony, first fleet, and operations chapters.
The completion event shares the objective receipt transaction. This integration
adds no extra gameplay requirements. First joins use retained empire history,
including removed empires. Unknown old join dates produce established-player
presence evidence bounded by schema installation, never a fabricated join date.
Signed-in bootstrap and owner reads reconcile retained join facts lazily.

The existing worker delivers batches of at most 100. Fenced leases and bounded
exponential retry delays recover from process interruption. Permanent invalid
responses quarantine a source record with a safe reason; evidence is not silently
deleted. Operators can inspect `community_outbox` state and investigate the
corresponding immutable source before resetting a quarantined record to pending.
Do not edit event payloads after Accounts accepts them.

Game deliveries resolve exact configured issuer/subject links. Grant ownership,
all award-source provenance and the local receipt commit atomically. Accounts
acknowledgement follows commit. Explicit fraud/operator revocations target one original
award source. A revoke arriving before its grant creates a durable tombstone;
late delivery cannot resurrect it. Other legitimate or legacy sources preserve
access, and saved equipment is never deleted. Missing assets do not block a valid permanent
award. Unlinked recipients and unsupported kinds remain pending; no substitute
recipient is inferred. Account-bound entitlements remain bounded observations,
separate from Orbit-owned `cosmetic_grants`.

## Alliance decisions

Accounts calls authenticated service endpoints using the reverse credential.
Requests with a browser Origin are rejected. Invitation evidence takes the same
alliance lock as membership/permission changes and saves an intent-bound receipt.
The recipient reference is opaque; a newcomer need not have joined Orbit.
Combined links check current membership and recruitment permission. Public links
check the stable alliance and active public invitation independently of the
original creator. Acceptance never admits a player to an alliance.

Honor snapshots use retained membership intervals and human participation at the
first crossing time. Once recorded, the recipient set is immutable. Departing
members keep personal awards, and dissolution preserves collective history.
Collective decorations have independent source records and can be equipped only
through existing authorized alliance presentation commands.

## Preflight

`POST /api/v1/rewards/service/status` uses the reverse callback credential and
returns the contract version, catalog release IDs, supported kinds, deployment
identity and combined readiness. `/service/diagnostics` adds safe worker
observations and capped backlog counts. It exposes no player or secret data. `worker_ready` means a worker has
recently attempted dispatch; `worker_connected` means a recent dispatch succeeded.
Use both when evaluating operational readiness. Accounts activation remains an
operator-controlled action after the compatible applications and content are ready.

## Cosmetic compatibility

Manifest versions 1 and 2 remain readable. Version 3 carries a `catalog_version`
release identifier, distinct from the numeric reader version, and adds account dyes and typed
finish/effect definitions. Supported renderer IDs are `plain`, `surface`, `light`
and `interaction`; the application validates enumerated patterns, numeric bounds,
surfaces and static reduced-motion behavior. Content cannot supply arbitrary CSS,
JavaScript or shaders. Loaders validate the pinned immutable hash before readiness.

Recipe version 3 stores `dye:<id>` in color fields and at most one `finish` and
one `effect` ID. Versions 1/2 keep literal colors. Official catalogs with named
dyes require named colors for new edits; unchanged legacy colors remain saved.
Absent content or expired access derives a free display fallback without deleting
choices or grants. Membership eligibility and paid supporter badges are distinct.

Editors negotiate `X-Orbit-Catalog: 4`; profile readers negotiate
`X-Orbit-Insignia: 5`. Older editors receive a conflict when they cannot safely
represent the installed library, and older profile readers receive a compatible
free appearance. Deploy supported readers before activating a v3 catalog. Keep
prior pins and assets; an old binary cannot read newly saved v3 recipes, so prefer
a forward fix after v3 writes. Do not downgrade the database or erase selections.

Focused checks: `npm test -- apps/web/src/client-model/community-rewards.test.ts`,
application tests in `community_rewards` and `cosmetic_catalog`, and
`make test-db DB_SUITES=community_rewards` using the disposable database runner.
Actual cross-service acceptance and final desktop/mobile rendering are separate
explicit checks; schema validation alone does not establish visual support.


## Recognition payloads

Manifest `marks` entries have a stable ID/name, explicit ownership scope and owner
kind, earned access, and a closed `render` union. A mark can reference one emblem,
finish or effect, or a bounded integer support duration. Catalog loading checks
references and renderer families; arbitrary payloads are rejected. Alliance marks
remain distinct named historical awards while their referenced cosmetics provide
concrete crest equipment access.

Authenticated `/api/v1/rewards/marks` returns only the owner's installed marks and
observation expiry. Public `/api/v1/rewards/alliances/{id}/honors` returns collective
award history and supported rendering definitions, without member activity or
recipient snapshots. Profile clients opt into permitted account honors with
`X-Orbit-Rewards: 1`. The supported mark renderer is part of the negotiated cosmetic reader. Its data
is limited to published honors, never private contribution totals.


Profile rendering uses the thin `/service/observations` endpoint in batches of at
most 100 subjects. It receives only bounded membership access and account-owned
cosmetic references, without balances, offers, gifts, financial data or history.
The full owner endpoint serves the authenticated rewards destination separately.
