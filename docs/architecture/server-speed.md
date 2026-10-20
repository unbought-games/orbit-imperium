# Universe game speed

A universe chooses one dimensionless integer speed from 1 through 100 at creation. New production universes default to **5×**. The choice is fixed for the universe's lifetime. Existing worlds and historical fixtures retain their saved speed, including pinned 10× MVP worlds and the earlier first-slice defaults.

Speed is part of [database-owned universe configuration](../operations/universe-configuration.md). There is no supported speed-edit command, retiming workflow or manual SQL conversion.

## Ownership and mapping

Speed belongs to persistent universe identity. Multiple universes in one database may choose different speeds; replicas verify each world's saved rules against its canonical speed. The pure engine receives typed rules and never reads environment variables. `universe create --speed S` selects speed explicitly; omission selects 5. Final production serving rejects `ORBIT_SPEED`. Restarts, maintenance, deployment and restore retain the saved choice and rules hash.

| Domain | Effect of the selected speed S |
| --- | --- |
| Economy | Resource production and speed-linked resource consumption multiply by S; energy and storage capacity retain their own formulas |
| Construction | Building duration scales through its owning duration formula |
| Research | Research duration scales through its owning duration formula |
| Shipyard | Ship and defense manufacturing duration scales through its owning duration formula |
| Fleets | S feeds the selected flight-time formula; fuel uses that formula, without a blanket multiplier |

Costs, combat stats, probabilities, capacity, worker leases, authentication expiry, policy rate windows and ordinary real-world time do not receive a global speed multiplier. Owning-domain rounding and minimum durations remain authoritative. Future domains need an explicit approved speed mapping.

## Validation and retention

Creation validates canonical unsigned integer CLI text before database effects and writes matching universe/rules speed atomically. Zero, fractions, signs, whitespace, leading zeros, overflow and values above 100 are rejected. Config and rules documents cannot change saved speed or topology. Configuration policy edits change admission controls without retiming gameplay or changing hashes.

Historical bootstrap commands retain their original fixture contracts only in test-support builds. A fixture flag cannot enable them in a production release. See [universe operations](../operations/universe-configuration.md) for creation, inspection, the two-artifact bridge upgrade, worker discovery and rollback boundaries.
