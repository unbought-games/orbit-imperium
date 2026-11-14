# Jump Gate operations

Deploy the new binary and frontend to all API, worker and operator processes,
then use the normal [rules upgrade](rules-updates.md). No new configuration,
manual SQL, fleet drain, historical backfill or separate preparation task is
required. Startup applies additive migration 0047, creating an empty
`jump_gate_uses` table. Fresh universes receive the standard feature immediately;
existing universes retain their rules until the normal activation step.

```sh
orbit rules upgrade --dry-run
orbit rules upgrade
```

The standard bundle adds the Jump Gate building and prerequisites, replaces the
released disabled placeholder and enables `jump-gates-v1`. Normal rules activation
initializes newly introduced building levels to zero and preserves existing paid
work. Customized definitions use the existing conflict/export/diff/apply flow;
they are never silently overwritten. Repeating the upgrade is a no-op.

After activation, two owned moons with completed gates can exchange mobile ships.
The gate facility shows source and destination readiness. Cooldown is one hour at
speed 1, fifteen minutes at speed 4 and thirty-six seconds at speed 100. Higher
gate levels do not reduce cooldown. Resources remain on their original moons.

Ordinary restart retains all cooldown commitments. Disabling the operation through
an ordered rules change rejects new jump admission but preserves gate-use facts
and original command receipt recovery. A pending deactivation also blocks new
admission. Re-enabling cannot reset a cooling gate. Before rolling back to a binary
without this command vocabulary, deactivate it and settle already admitted work;
follow the existing rollback compatibility policy for retained journal history.
Do not run old writers after activation.

This feature does not implement moon destruction or standalone moon abandonment.
Existing parent-planet abandonment and empire deletion remove gate state with the
moon. A new moon never inherits a previous moon's cooldown.
