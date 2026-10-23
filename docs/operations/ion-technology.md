# Ion Technology

Ion uses the existing player-wide research, quote, payment, cancellation and
completion machinery. The engine and wire vocabulary already support its ID;
this addition needs no database migration or protocol change. Deployment retains
each universe's saved rules. Activation is an explicit per-universe operation.

## Rules and prerequisites

The private reference archive's
`orbit-internal-docs/original-docs/specs/research-progression.md` specifies:

| Content | Level 1 metal / crystal / deuterium | Completed prerequisites |
| --- | --- | --- |
| Ion Technology | 1,000 / 300 / 100; doubles each level | Local Research Lab 4; player Energy Technology 4 and Laser Technology 5 |

Laser requires Lab 1 and Energy 2; Ion's requirements cover those earlier gates.
The initiating planet supplies the resources and must have Lab 4. Research levels
apply player-wide within the universe. Paid or queued levels do not satisfy gates.
At speed 5 and Lab 4, Ion levels 1–3 take 187, 374 and 748 seconds. Their costs are
1,000/300/100, 2,000/600/200 and 4,000/1,200/400. The existing integer research
formula uses metal plus crystal, completed Lab level and universe speed.

There is one active research operation per player. Lab construction and research
exclude each other. Cancellation before due refunds the stored full payment;
completion wins at due. Completed Ion survives later Lab demolition.

Ion is an unlock technology, with no direct combat bonus or demolition discount.
The reference's future consumers are Cruiser (Ion 2, Impulse 4, Shipyard 5), Ion
Cannon (Ion 4, Shipyard 4), and Plasma Technology (Ion 5, Energy 8, Laser 10, Lab 4).
This patch does not enable those consumers. Higher Ion levels remain researchable
within numeric limits, with no additional specified benefit above level 5.

## Prepare and activate

`rules/content/ion-technology.json` holds the reviewed feature data.
`scripts/prepare-ion-rules.mjs` adds only Ion's definition and catalog requirements.
Research Lab, Energy Technology and Laser Technology must already be defined and
enabled in the export. If Laser is absent, follow [Laser activation](light-laser.md)
first, then export again. Ion does not require Light Laser defense or Shipyard.

The script preserves universe identity, base revision, speed, topology and all
unrelated custom values, including Laser costs. It deliberately replaces existing
Ion costs and prerequisites; review the diff if Ion was customized previously.
`rules/mvp-v1-slice-9.json` is the immutable complete fixture following slice 8,
not a new-world default or a replacement for a live export.

Deploy the reviewed release across API and worker instances before activation.
Follow the [normal rules workflow](rules-updates.md), using the deployed binary:

```sh
orbit rules export --universe <id> --out rules-before.json
node scripts/prepare-ion-rules.mjs rules-before.json rules-ion.json
orbit rules diff --universe <id> --file rules-ion.json
orbit rules apply --universe <id> --file rules-ion.json
orbit rules export --universe <id> --out rules-after.json
orbit audit --universe <id>
```

Run the preparation script from this checkout against the export. Use fresh output
paths; it refuses to overwrite files. Retain before/after exports, semantic diff,
effective revision/hash and audit result. A stale proposal requires a fresh export;
retry the identical proposal to observe a pending scoped activation.

The expected initialization delta is only Ion Technology at level 0 for existing
players, or no delta if already defined. New signups also receive it at 0. Existing
levels, balances, inventories, paid work, sessions and epoch are preserved. Refresh
the client to see Ion's costs, prerequisite progress and artwork. The local tests
exercise research behavior without spending live players' resources.

To stop new Ion research, export the current revision and disable its catalog
entry. Keep the research definition and retained levels. Already-paid work keeps
its accepted payment and completion time, and cancellation refunds its original
payment. Removing the definition or restoring an older export is rejected; use a
compatible forward fix.
