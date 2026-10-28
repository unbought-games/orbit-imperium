# Hyperspace Drive

Hyperspace Drive requires a completed Research Lab 7 on the initiating planet and
player Hyperspace Technology 3. That technology requires Energy Technology 5 and
Shielding Technology 5. Level 1 costs 10,000 metal, 20,000 crystal and 6,000 deuterium;
all costs double each level. At Lab 7 and research speed 5, levels 1–3 take 2,700,
5,400 and 10,800 seconds. Research is player-wide within the universe, paid by its
origin, with the existing single slot, Lab locks and exact cancellation refunds.

The classic Bomber switch is included: below completed Drive 8, Bombers use base
speed 4,000 plus 20% per Impulse level. At Drive 8 they replace that profile with
base speed 5,000 plus 30% per Hyperspace Drive level: 17,000 at level 8, 18,500 at
level 9. Bonuses do not stack. Base fuel remains 1,000, and cargo remains 500.
Research completion changes new quotes and launches; a stale quote is rejected.
Already-launched fleets retain their recorded duration, fuel, arrival and return
terms across research, activation and restart. Mixed fleets use the slowest ship
for travel time and each ship's selected profile for fuel.

`rules/content/hyperspace-drive.json` owns research costs/gates and the Bomber
replacement. [Battleships](battleship.md) use native Hyperspace propulsion and
unlock at Drive 4 with Shipyard 7. [Destroyers](destroyer.md) use native Hyperspace propulsion and
unlock at Drive 6 with Shipyard 9 and Hyperspace Technology 5. No later Recycler
switch or cargo bonus is included.
The catalog derives technical data from active rules; the optional
`hyperspace_upgrade` API field keeps retained profiles and older responses readable.
No database migration, new endpoint or protocol version is needed.

## Activation

The standard content bundle advances to 0.7.0. Fresh setup includes the Drive and
Bomber switch. Existing universes retain saved rules until explicit activation.
Deploy the supporting API, worker, operator binary and client everywhere first:

```sh
orbit rules upgrade --universe <id> --dry-run
orbit rules upgrade --universe <id>
orbit rules export --universe <id> --out rules-after.json
orbit audit --universe <id>
```

On the preceding Hyperspace Technology bundle, activation initializes only
Hyperspace Drive level 0 for existing players and adds the optional Bomber profile.
Older standard worlds also receive preceding bundle additions. New players receive
level 0. Repeated upgrades are no-ops. Preserve the diff, effective revision/hash
and audit result; refresh clients after activation.

The upgrader recognizes the exact previously released Bomber profile and rejects
customized profiles, research costs, prerequisites and intentionally disabled
content. Use export/diff/apply for reviewed custom activation. Retained artifacts
omit the optional profile, preserving their serialization and hashes.

To stop new research, disable the Drive and dependent Battleship and Destroyer catalog entries while retaining its
research definition, earned levels and Bomber profile. Paid work keeps its original
terms; cancellation refunds the original payment. Disabling research does not
remove earned speed. Disabling Hyperspace Technology also requires disabling its
Drive, Battleship and Destroyer dependents. Removing definitions or replaying an older export is not rollback.
See [Rules updates](rules-updates.md) for the operational contract.
