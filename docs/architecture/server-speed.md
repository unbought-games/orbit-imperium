# Universe game speed

A universe chooses one dimensionless integer speed from 1 through 100 at creation. New production universes default to **5×**. Operators can change speed through an ordered rules activation; existing paid work keeps its committed timing. Existing worlds and historical fixtures retain their saved speed, including pinned 10× MVP worlds and the earlier first-slice defaults.

Speed is part of [database-owned universe configuration](../operations/universe-configuration.md). Use `rules export`, edit `speed`, then `rules diff` and `rules apply`. There is no retiming workflow or manual SQL conversion.

## Ownership and mapping

Speed is saved with the active universe rules. Multiple universes in one database may choose different speeds; replicas verify each world's saved rules against its canonical speed. The pure engine receives typed rules and never reads environment variables. `universe create --speed S` selects speed explicitly; omission selects 5. Final production serving rejects `ORBIT_SPEED`. Restarts, maintenance, deployment and restore retain the saved choice and rules hash.

| Domain | Effect of the selected speed S |
| --- | --- |
| Economy | Resource production and speed-linked resource consumption multiply by S; energy and storage capacity retain their own formulas |
| Construction | Building duration scales through its owning duration formula |
| Research | Research duration scales through its owning duration formula |
| Shipyard | Ship and defense manufacturing duration scales through its owning duration formula |
| Fleets | S feeds the selected flight-time formula; fuel uses that formula, without a blanket multiplier |

Costs, combat stats, probabilities, capacity, worker leases, authentication expiry, policy rate windows and ordinary real-world time do not receive a global speed multiplier. Owning-domain rounding and minimum durations remain authoritative. Future domains need an explicit approved speed mapping.

## Validation and retention

Creation validates canonical unsigned integer CLI text before database effects and writes matching universe/rules speed atomically. Zero, fractions, signs, whitespace, leading zeros, overflow and values above 100 are rejected. Policy config documents cannot change speed or topology. Rules documents may change speed for signup universes; topology and historical MVP profiles remain fixed. Configuration policy edits change admission controls without retiming gameplay or changing hashes.

Historical bootstrap commands retain their original fixture contracts only in test-support builds. A fixture flag cannot enable them in a production release. See [universe operations](../operations/universe-configuration.md) for creation, inspection, the two-artifact bridge upgrade, worker discovery and rollback boundaries.

## Mid-universe speed changes

Deploy speed-aware API, worker and operator binaries everywhere before applying
an update. In scoped mode workers execute the queued activation; an older worker
would reject a speed-changing boundary. Use the existing rules revision check,
ordering boundary and activation audit. Speed, active rules hash and rules
revision commit atomically, after settling every planet through the boundary
under the old rates. Retain old rulesets for historical commitments.

Construction, research, prepaid manufacturing batches (including their queued
units), outbound fleets, return legs and recalls keep their paid terms. New work
uses the new speed, and old quotes require fresh consent. Production after the
boundary uses the new rates. No universe reset, epoch change, fleet retiming or
schema migration is needed. A later speed reversal is another forward activation;
it does not undo production or retime work accepted under the intervening speed.
