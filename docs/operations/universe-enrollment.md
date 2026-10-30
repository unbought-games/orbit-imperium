# Universe enrollment

## Automatic homeworld placement

New signups, machine/bot enrollment and automatic `add-player` / `add-bot`
scenario placement use `neighborhood_homeworld`. It targets approximately two
players per system across the inhabited region, including gaps, using the
existing Galaxy 1 homeworld coordinates. It does not relocate existing players.
The target is not a two-player cap on individual systems.

An empty Galaxy 1 starts in a seeded random free system. Subsequent arrivals
prefer nearby, lightly populated systems within ten systems of an existing
homeworld. The region grows with population; pre-existing wider regions never
shrink. Local density and same-system crowding reduce placement weight, leaving
irregular pockets and gaps. Colonies and unreleased occupied slots block eligible
positions 4–12 without counting as additional players. When colonies fill the
candidate neighborhood, placement falls back to the nearest free Galaxy 1 system.

Galaxy 1 is currently a hard boundary. Once its eligible slots fill, automatic
enrollment returns universe-full even if other galaxies have room. Saved geometry
and configured admission ceilings are unchanged; they are not a guarantee of
available Galaxy 1 slots. Explicit operator coordinate overrides remain explicit
scenario choices, and colonization is unaffected.

This applies to future admissions in existing `signup-v2` universes as well as
new ones. Saved rules/profile identifiers and homeworld creation facts are not
rewritten. The new allocator uses the `neighborhood-homeworld-v3` random-stream
input label; `balanced_homeworld` remains available for historical simulation and
tests. Legacy MVP bootstrap placement is unchanged. Roll admission-serving
processes and operator tools to this version before adding a new bot batch.
`make test-placement` covers both current placement and historical compatibility.

## Enrollment timestamps

Migration `0011_membership_joined_at.sql` adds the nullable `bigint`
`universe_memberships.joined_at_ms`. It records the original server enrollment
logical time in Unix milliseconds. Online enrollment uses PostgreSQL's server
clock, clamped to the universe runtime frontier, ordering floor, and applicable
admission scope frontiers. It is the same `at` used to initialize the player's
homeworld and policy, saved in the membership transaction. It is not account
registration time, client click time, first play, or transaction commit wall time.

Existing rows remain NULL. There is no default or backfill. NULL means the join
time is unknown, including memberships created by an older server during a
rolling deployment. Repeated enrollment, concurrent retries, login, and migration
reruns preserve the original value, including NULL. Values must be nonnegative;
zero is a known timestamp, not a missing value. Applied migration files and the
historical pre-baseline schema fixtures remain unchanged.

Both explicit development seed/reset and test-only MVP bootstrap record their
supplied fixture `at`. Their universes retain `development=true`; exclude these
universes from player measurement. Seed resets create a new development world
and memberships; matching bootstrap reruns preserve their original timestamps.
Operational test accounts in a non-development universe still need separately
maintained exclusions. Do not infer population from a timestamp or player name.

The fact is available directly through SQL after migration; no gameplay protocol
or public API changes are required. For example, within an explicitly selected
universe, report known and unknown joins separately:

```sql
SELECT count(*) FILTER (WHERE m.joined_at_ms IS NOT NULL) AS known_joins,
       count(*) FILTER (WHERE m.joined_at_ms IS NULL) AS unknown_joins
FROM universe_memberships m
JOIN universes u ON u.id = m.universe
WHERE m.universe = $1 AND NOT u.development;
```

Apply the measurement's identity and operational-account exclusions before
building cohorts. Use half-open millisecond intervals for timed joins, and never
coalesce unknown history to account creation, world creation, migration time,
or earliest retained command. This additive fact enables future join cohorts;
it does not reconstruct historical cohorts or prove complete play history.
