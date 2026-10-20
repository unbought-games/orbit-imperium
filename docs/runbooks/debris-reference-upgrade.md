# Debris reference counter removal

> Historical implementation record. The migrations and upgrade procedures described below have been superseded by `0001_fresh.sql`. This release requires the [fresh database cutover](../runbooks/development-server.md#fresh-database-cutover); it does not convert retained worlds.


Live debris marker retention now derives from the complete active mission fleet
collection. Both outbound and returning destinations retain their exact field
identity; terminal fleets do not. Cleanup observes the already committed fleet
legs, including when return and cleanup have equal timestamps. Marker identity,
presence, resources, generation, cleanup deadline, and revision remain stored.
Launch/return revision increments remain unchanged for ordering and replay.

Migration `20261015174510_remove_debris_reference_counts.sql` removes only
`active_references` from live `debris_fields.data`. It preserves every other key
and does not rewrite transition journals, receipts, reports, or evidence. Old
snapshot JSON still deserializes; new snapshots omit the counter. The SQL fleet
active column and fleet loading query are unchanged by this release.

Stop admission and workers from the previous release before migrating, following
the [database cutover procedure](development-server.md#fresh-database-cutover). The old
binary requires the removed JSON member, so it must not run against the upgraded
live data. Binary-only rollback is unsupported; restore the consistent pre-upgrade
backup with the old release if rollback is needed. Pending inputs and deadlines
retain their original ordering.

For investigation replay of journals produced before this change, use
`orbit_engine::replay_legacy_debris_transition(&raw_facts, &input, &rules)`. It
returns the historical JSON outcome, derives obsolete counters for comparison,
and hashes the untouched raw facts. It never persists that representation.
Select this adapter by the producing release: an empty debris map alone cannot
identify the journal format. New journals use `transition` normally. Retain old
executor/rules artifacts for historical replay beyond this format adaptation.
Do not apply deserialized old ChangeSets to normalized live state: their expected
fact hashes describe the old JSON format.

The five fixtures in `crates/engine/tests/fixtures/legacy-debris-journal.jsonl`
were captured from commit `8406eb6aa8d2972c96bb58e40dc75f7d319ce047` using
`harvest_reference_survives_return_and_cleanup_records_loss`. Each contains the
original facts, input, and SHA-256 outcome hash for launch, deferred cleanup,
harvest arrival, normal return, or final cleanup. Tests compare the adapter's
output against these original hashes, independently of the new serializer.
