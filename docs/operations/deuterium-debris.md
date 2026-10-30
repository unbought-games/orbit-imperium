# Deuterium in debris

Each universe can enable `artifact.world.combat.deuterium_in_debris` through the
existing rules export/diff/apply workflow. It defaults to false, including when
absent from historical rules. There is no separate percentage: `ship_debris_bps`
applies to destroyed ships' construction deuterium as well as metal and crystal.
For example, 100 Recyclers destroyed at 30% generate 300,000 metal, 180,000 crystal,
and (when enabled) 60,000 deuterium.

Combat uses the setting active at encounter resolution. Gross construction costs
from both sides are summed per resource before multiplying by the basis points,
flooring to whole units, and converting to internal micro-units. Fuel, carried
cargo, loot, surviving ships, and defenses do not contribute. This feature does
not implement moon formation; future moon-chance calculations must exclude
deuterium. Expedition debris and automatic salvage are separate features.

Recyclers share their existing collection capacity among all available resources.
Collection uses capped equal shares, redistributes unused capacity, and assigns
whole-unit remainders in metal, crystal, deuterium order. This is an explicit Orbit
rule, not a claim of exact OGame remainder parity. With zero deuterium, results
match the previous two-resource allocator. Loaded cargo still consumes space;
escorts do not increase Recycler collection throughput.

Visibility and weekly cleanup use metal + crystal + deuterium against the existing
300-unit threshold. Smaller fields remain manually targetable until cleanup.
Outbound and returning fleets retain their existing marker protection. Cleanup
records all removed balances. Turning the setting off never deletes or prevents
collection of existing deuterium. Turning it on never recreates historical losses.

## Deployment and activation

Deploy supporting API and worker binaries everywhere before activating the setting.
Older binaries reject the new rules field and cannot safely retain nonzero debris
deuterium when writing fields. Once new rules/fields have been written, use a
rollback image that understands this feature; turning the toggle off is not a
conversion back to the old format. Already-open old clients may need a reload for
the expanded galaxy response.

No SQL schema migration, backfill, historical rehash, or special backup/restore
workflow is required. Missing debris balances decode as zero; zero is omitted on
field serialization to preserve existing state/journal shapes. Saved rules retain
their original JSON and identity. Historical cleanup replay reproduces its original
audit shape without modifying retained evidence.

Export a fresh document, set only the boolean, inspect the diff, and apply:

```sh
orbit rules export --universe <id> --out rules.json
# Edit artifact.world.combat.deuterium_in_debris to true in rules.json.
orbit rules diff --universe <id> --file rules.json
orbit rules apply --universe <id> --file rules.json
```

A toggle and/or debris-percentage-only change reports `RulesOnly` and skips planet
reads and settlement. Mixed economic changes still settle production. Accepted
fleet fuel, cargo, and deadlines remain unchanged. Standard content upgrades
preserve each universe's custom boolean and percentage.

## Validation

`make test-deuterium-debris` runs deterministic engine, client, and fixture browser
coverage. Set `ORBIT_TEST_SCREENSHOTS=1` to retain desktop/mobile captures.
`make test-deuterium-debris-db` uses the existing disposable-database runner with
an isolated Compose project already running. It covers guarded rules activation in
both runtimes, persistence across reconnects, and setting changes retaining fields.
No full-system or production-container tests are added to routine CI.
