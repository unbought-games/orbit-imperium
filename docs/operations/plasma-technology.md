# Plasma Technology

Plasma is player-wide research using the existing quote, payment, cancellation and
completion machinery. Its ID, artwork and wire vocabulary already exist; no
schema migration or protocol change is required.

The selected classic research rules require a completed Research Lab 4 on the
initiating planet, plus completed Energy Technology 8, Laser Technology 10 and
Ion Technology 5. The initiating planet pays 2,000 metal, 4,000 crystal and 1,000
deuterium for level 1. Costs double each level. At universe speed 5 and Lab 4,
levels 1–3 take 864, 1,728 and 3,456 seconds. Existing research/Lab exclusion,
full cancellation refunds and completion-at-deadline rules apply.

This addition enables only the research. It has no mining, combat or other
per-level bonus, and currently unlocks nothing in the standard rules. Bombers and
Plasma Turrets remain disabled and have no new definitions. Their planned gates
are Plasma 5 with Shipyard 8 and Impulse Drive 6 for Bombers, and Plasma 7 with
Shipyard 8 for Plasma Turrets. Those units require separate implementation and
activation. Higher research levels remain possible within numeric limits without
an additional benefit.

## Built-in activation

`rules/content/plasma-technology.json` supplies the reviewed costs and gates to the
standard bundle. Fresh `orbit setup` and `orbit universe create` include Plasma.
Existing universes retain their saved rules across deployment and restart.

After deploying the supporting image to every API, worker and operator process,
use that image's binary with the service database configuration:

```sh
orbit rules upgrade --universe <id> --dry-run
orbit rules upgrade --universe <id>
orbit rules export --universe <id> --out rules-after.json
orbit audit --universe <id>
```

The command upgrades the entire standard bundle, including any missing earlier
content; it is not a Plasma-only switch. On an otherwise current standard world,
the only new content is Plasma and the only initialization is Plasma level 0 for
existing players. New signups receive level 0 too. Existing research levels,
paid work, balances, inventories and universe identity are preserved. Retain the
diff, effective revision/hash and audit result. Refresh clients after activation.

No Node script, source checkout or manual JSON editing is needed for a standard
upgrade. Custom bundle-owned values or intentionally disabled content cause a
conflict instead of being overwritten. Use the existing export/diff/apply flow
for selective or custom activation. Repeating a successful upgrade is a no-op;
if pending, rerun the same binary's command to observe the queued activation.
See [Rules updates](rules-updates.md) for the full operational contract.

To stop new Plasma research, disable its catalog entry using a fresh export and
forward apply. Retain its definition and earned levels. Already-paid research
keeps its accepted payment and completion time; cancellation refunds the original
payment. A standard upgrade will not silently re-enable deliberately disabled
Plasma. Removing its definition or replaying an older export is not a rollback.
