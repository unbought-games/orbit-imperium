# Terraformer

Terraformer is a planetary facility requiring completed local Nanite Factory 1
and player Energy Technology 12. Level one costs 50,000 crystal and 100,000
deuterium; each subsequent level doubles both costs. Construction uses the
universe's existing building formula, completed Robotics and Nanite levels, and
speed. Terraformer cannot be demolished.

Each completed level adds five fields to the planet's original capacity and
occupies one field itself, yielding four additional free fields. There is no
extra field on even levels. Capacity is derived from original fields and completed
levels; it is never written back into the stored base field count. Operator world
inspection reports effective `fields` and original `base_fields`; scenario exports
preserve the original fields and completed levels. An upgrade
requires one free field and reserves it until completion or cancellation. A full
planet must demolish another eligible building first. With base capacity 100 and
99 used fields, Terraformer 1 gives capacity 105 and 100 used fields; Terraformer 2
then gives capacity 110 and 101 used fields.

The target level requires `1000 × 2^(target level − 1)` gross energy at acceptance.
Saved production percentages, stationed satellites and actual fuel-supported
Fusion output apply. Mine demand is not subtracted. The check uses production
settled to acceptance before resource payment. Energy is neither consumed nor
reserved: spending the last deuterium or losing power after acceptance does not
cancel construction. Canceling before completion refunds the original payment
and releases the field reservation without adding capacity.

## Deploy and activate

Fresh `orbit setup` and `orbit universe create` worlds include Terraformer.
Retained worlds keep their saved rules until explicitly upgraded. Deploy compatible
API, worker, frontend and operator binaries everywhere before activation:

```sh
orbit rules upgrade --universe <uuid> --dry-run
orbit rules upgrade --universe <uuid>
```

The bundle supplies Nanite before Terraformer and initializes the new completed
building level to zero atomically. Preview is read-only and repeating an applied
upgrade is a no-op. Custom definitions and deliberately disabled content conflict
instead of being overwritten. Preserve the definition when disabling new
Terraformer construction: existing capacity and paid jobs remain valid.

No new schema migration, environment variable or preparation script is required.
Record the active rules hash/revision and confirm readiness. Old binaries must not
be restored after activation unless they understand the new rules and facts.
See [rules updates](rules-updates.md) for pending activation and rollback behavior.

## Validation

`make test-terraformer` runs focused engine, technical-data, client and browser
coverage. `make test-terraformer-db` covers retained-world activation, both runtime
modes, real prerequisites and satellite construction, power loss, restart, owner
field projections and disabling new construction. It uses the disposable database
runner and requires the configured Compose database. Routine checks remain in
`make check`, `make test-db` and `make test-ui`.
