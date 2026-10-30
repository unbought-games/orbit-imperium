# Persisted rules and accepted terms

The saved JSON representation is authoritative. `Ruleset`, `FleetTerms`, and
`MissileTerms` are immutable `Persisted<T>` values. Their private interpreted value
is a read-only derived view, never another writable source. Serialization emits
the original JSON, including omitted defaults and historical identifier spelling.
To edit, clone the interpreted artifact/draft and construct a new ruleset or seal
a new quote. Neither `DerefMut` nor a mutable raw-JSON accessor exists.

## Integrity and interpretation

The existing hash formats are retained; no migration, backfill, UUID identity,
PostgreSQL textual-JSON hash, or historical hash update is needed:

- Rules format 1 (the existing untagged envelope): SHA-256 over canonical JSON
  `[artifact, speed]`; the envelope carries `artifact`, `speed`, and `hash`.
- Fleet protocol 4: canonical `{"protocol":4,"terms":<original terms>}` with only
  `terms_hash` replaced by the empty string while computing the digest.
- Missile protocol 4: the same operation with the key `missile_terms`.

Canonicalization is the engine's existing `types::hash`: JSON object keys sorted
recursively by `serde_json::Value`, then compact JSON bytes. Integer values retain
i64/u64 precision. Whitespace and JSONB key ordering do not affect identity.
There is no fallback to a hash of today's normalized structs. Unsupported future
formats must receive an explicit decoder and hash-material definition.

Deserialization checks the original digest before interpreting enums or defaults.
Rules gameplay constraints are checked separately by `Ruleset::validate`, including
costs, supported policies, and references. Storage still binds active hash and speed
to the universe. Immutable accepted terms retain their existing state/lineage
validation. Hashes detect altered content; they are not signatures or a substitute
for authorization and transaction checks.

New rules constructed from typed artifacts serialize current defaults. In particular,
the existing beginner-protection multiplier now serializes explicitly as 5; old
artifacts without the field still interpret as 5 and retain their old hash. Artifact
JSON imports retain the supplied representation; explicit typed edits receive a new
hash. Operator export emits the current interpreted vocabulary. Diff/apply compare
validated runtime meaning, so an unchanged export or default normalization is
AlreadyActive with the existing hash. A real edit publishes a separate snapshot.
Both execution modes retain their existing settlement and ordering behavior.

## Temporary identifier bridge

`Deathstar` reads as the single `Dreadnought` ship identity. New typed output uses
`Dreadnought`; saved rules and accepted terms keep their original spelling and hash.
Aliases do not enable this disabled ship or change any gameplay. Ship maps reject
colliding spellings; catalog, cost, combat, inventory, and manifest checks reject
duplicate logical entries. Inventory writes match either supported spelling while
leaving the stored key untouched; revision checks and the exactly-one-row check
reject stale writes and collisions. Unknown fields and unrelated identifiers remain errors.

The bridge is deliberately narrow. Remove it only after retained rules, pending
work, and supported replay evidence no longer require the old spelling, or after
an explicitly planned offline conversion. Do not silently normalize historical
records to make removal convenient. This does not promise support for every old
application release.

## Commitment and quote audit

- Mission fleets and missiles persist complete hashed accepted terms. They now
  verify original material at load and serialize it unchanged through movement,
  contact, recall, return, and completion.
- Construction retains paid resources, start/deadline, profile hash, accepted
  progression material, and the consent hash. Research and manufacturing retain
  their accepted payment/deadline or unit cost/duration/facility commitments.
  Their quote digests include request-time material that is not completely stored
  with the operation. These digests are consent tokens, not reconstructible
  checksums of the operation row. Completion and refunds use retained values;
  they do not re-quote or rehash the operation through current rules. This change
  adds no invented checksum to old operations and does not alter those paths.
- New command consent is still checked against a freshly calculated quote. A quote
  issued by a different binary whose wire material differs may require re-quoting;
  no alias can silently approve changed terms. Already accepted operations retain
  their original payments and timings.
- Live fact hashes, collection revisions, claims/fences, idempotency, rules
  references, and atomic commit validation are unchanged. Runtime state itself is
  not rewritten or rehashed as a migration.

`crates/engine/tests/fixtures/persistence/deathstar-rules.json` contains the
`mvp-v1-slice-4.json` artifact from the parent of rename commit
`39aeab27e814512fc90cf1834b18b1ccb4916b5b`, with its original canonical hash at speed
10. Tests exercise this actual missing-field/legacy wire representation, corruption,
ambiguous aliases, precise integers, immutable round trips, PostgreSQL JSONB
restart/no-op behavior, and accepted work completion. Existing replay fixtures
remain unedited and now verify their historical rules identity instead of assigning
it over a reconstructed current ruleset.

Run the focused deterministic suite with `make test-persistence`. With an isolated
PostgreSQL Compose project already running, `make test-persistence-db` runs the
compatibility/retry/commit tests; `make _db-corruption` covers integrity and local
unsupported-state handling. `scripts/test-db.sh` also accepts an optional native
nextest filter expression as its second argument. Each run still owns and cleans
up its own disposable database.
