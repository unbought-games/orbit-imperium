# Nanite Factory

Nanite Factory is a planetary facility requiring completed local Robotics Factory
10 and player Computer Technology 10. Level one costs 1,000,000 metal, 500,000
crystal and 100,000 deuterium; each subsequent level doubles each resource cost.
Normal construction fields, prerequisites, payment and cancellation rules apply.

Every completed local level divides raw construction, demolition and manufacturing
duration by two, in addition to Robotics or Shipyard acceleration. Research is
unaffected. Use completed levels at acceptance, including the old Nanite level for
a self-upgrade or demolition. Existing Nanites continue working if a prerequisite
is later demolished or new Nanite construction is disabled.

Building upgrade timing uses raw costs, divides by `2^Nanite` before flooring, then
applies the existing construction adjustment: subtract 90 seconds when the floored
raw duration is at least 100 seconds; otherwise use a one-second minimum.
Demolition has no 90-second adjustment. Manufacturing floors each unit's duration
to seconds with a one-second minimum before multiplying by quantity. Displayed
construction durations therefore do not always halve exactly.

At economy speed 1 and Robotics 10, both Nanite 1 with Nanite 0 and Nanite 2 with
Nanite 1 take 196,273 seconds. Demolishing Nanite 1 at Robotics 10/Nanite 1 costs
500,000 metal / 250,000 crystal / 50,000 deuterium and takes 49,090 seconds.

Nanite upgrades and demolition cannot overlap any unfinished local manufacturing,
including paid waiting batches of ships, satellites, defenses and missiles. The
same exclusion applies when appending manufacturing during Nanite construction.
Research and work on other planets remain independent. No derived speed multiplier
or queue-lock flag is stored. Accepted operations retain their paid terms and
completion times through rule changes and restarts.

## Deploy and activate

Fresh `orbit setup` and `orbit universe create` worlds include Nanite Factory.
Existing worlds keep their current rules until explicitly upgraded. Deploy the
supporting release to every API, worker, frontend and operator process first:

```sh
orbit rules upgrade --universe <uuid> --dry-run
orbit rules upgrade --universe <uuid>
```

The standard bundle adds the definition and prerequisites and atomically initializes
Nanite level zero on existing planets. Preview is read-only; repeating a completed
upgrade is a no-op. Custom definitions and deliberately disabled Nanites produce
conflicts rather than silent overwrites. Disabled base prerequisites are rejected.
Use `rules export`, `rules diff` and `rules apply` for intentional customizations.
Retain the building definition when disabling new construction so existing levels
and paid work remain valid. Terraformer and lunar content remain unavailable.

No new schema migration, environment variable or preparation script is required.
Confirm `Applied` or `AlreadyActive`, record the rules hash/revision, and verify
readiness. For pending activation and rollback constraints, see
[rules updates](rules-updates.md).
