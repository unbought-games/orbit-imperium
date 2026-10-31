# Read-only tracker API

`GET /api/v4/universes/{universe-uuid}/tracker` returns one committed,
repeatable-read snapshot of the full player score roster and occupied planets.
It requires a **dedicated tracker token**. It does not accept login cookies or bot
credentials. Tracker tokens do not authenticate any gameplay API.

After deploying this version and applying migration 0027 through the normal
migration workflow, an operator can issue a credential:

```sh
orbit tracker token issue --universe UUID
```

The random bearer secret is printed once; only its SHA-256 digest is stored.
Keep it in the tracker's server-side secret store, never browser code, a URL,
logs, Git, or a chat message. It grants read access to precisely one universe
and its current epoch. A universe reset invalidates existing credentials.
There is no player impersonation, bot participation, gameplay command, or
access to espionage, resources, fleets, technology levels, activity, or private
asset lots. Issuing a token creates no player or planet.

```sh
curl --fail -H "Authorization: Bearer $ORBIT_TRACKER_TOKEN" \
  "$ORBIT_BASE/api/v4/universes/$ORBIT_UNIVERSE/tracker"
```

Response fields:

- `schema_version`: `1`.
- `universe`, `epoch`: UUIDs. Never join histories across epochs.
- `sampled_at`: milliseconds since Unix epoch.
- `processing_pending`: whether due work is still pending; scores reflect
  committed state, not a promise that all due work has settled.
- `players`: existing public ranking projection: `player`, `username`, decimal
  `points` string, `rank`, optional `alliance`, and `previous_rank: null`.
  Current universe members with zero points remain included. Ties use the same
  competition ranking as High Scores. Tracker history supplies its own deltas.
- `planets`: occupied planetary bodies, each with `id`, `owner`, nullable `name`,
  and `coordinates: {galaxy, system, position}`. Moons and abandoned empty slots
  are excluded. An owner may no longer be in the current ranking roster; retain
  the owner UUID and display an unknown/former-owner label in that case.

The endpoint returns `Cache-Control: no-store`. Invalid, revoked, wrong-universe,
and stale-epoch credentials return 401 without disclosing whether a universe
exists. Storage failures are errors, never an empty successful snapshot. The
request does not record presence, spend deuterium, wake a bot, settle gameplay,
or write history. Historical snapshots belong in the external tracker.

Revoke **all tracker tokens for a universe**:

```sh
orbit tracker token revoke --universe UUID
```

Rotation: issue a replacement, install it in the tracker, verify a read, then
revoke old credentials only when all clients are stopped (this first version's
revoke command revokes all). Reissue after revocation before restarting clients.
Revocation applies to subsequent requests; an already-running snapshot may finish.

Poll conservatively (e.g. once daily at 04:04 America/Los_Angeles), with no
parallel polling or tight retry loop. A complete response is atomic; only commit
a local snapshot after validating the entire response. This first endpoint is a
full export, with cost proportional to current assets and planets.
