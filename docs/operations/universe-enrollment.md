# Universe enrollment timestamps

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
