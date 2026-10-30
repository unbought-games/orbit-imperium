# ADR 001: Empire customization belongs to Orbit

Status: accepted and implemented for the initial insignia slice, 2026-10-30.

## Context

Unbought funds development through optional cosmetic content. An empire should
have an identity its owner can build over time without purchasing gameplay
power. The first slice supplies three free insignia symbols and one additional
supporter symbol, two editable colors, an account-owned collection, and a
per-universe equipped design. Settings contains the editor; Galaxy shows the
equipped insignia alongside the player's identity.

Accounts already supplies authenticated identity and expiring public supporter
observations. Orbit supports local authentication and independent OIDC providers.
An independent game installation must not require Unbought services for cosmetics.

## Decision

### Ownership

Accounts owns authentication, the global username, billing, and supporter tier.
Orbit owns its cosmetic catalog, authored designs, permanent grants, equipped
appearance, storage, and presentation. Accounts does not know about Laureate,
color recipes, or individual Orbit universes. Adding a symbol does not require
an Accounts release. Future games own their own themes and collections; cross-game
symbols are a separate future contract.

The existing `(issuer, subject)` mapping identifies a local Orbit account. Its
`insignia_designs` collection survives individual universe memberships. Each
`empire_insignias` row selects one of that account's designs for one universe.
Composite foreign keys enforce ownership; deleting a design resets every empire
using it to the default. Editing a design updates the empires using it. An empty
selection derives the default rather than storing a default copy.

### Access is a union

A catalog symbol is usable when any of these applies:

1. The symbol is free.
2. The deployment's cosmetic policy is unrestricted.
3. The account has a permanent grant for the symbol.
4. The symbol requires supporter access and fresh Accounts evidence confirms it.

`ORBIT_COSMETIC_ACCESS=unrestricted` is the self-hosted default. It makes all
included symbols available without cosmetic eligibility calls to Accounts and
does not create supporter badges. `supporter` explicitly enables the existing
Accounts integration and requires its profile credential and OIDC configuration.
Authentication and public recognition remain independently configured: enabling
OIDC or a public-profile integration can still make its normal authentication or
name/badge calls; unrestricted cosmetics add none.

For this catalog, any recognized supporter tier unlocks Laureate. Other symbols
are Wayfinder, Starwing, and Ascendant. Access requirements live on catalog items,
not in components, storage adapters, or billing code.

`insignia_grants(account, symbol)` records permanent ownership with a grant time
and reason. The entitlement is to a stable **catalog symbol**, including all
color variations and saved designs using it. Deleting a saved composition does
not delete the unlock. This is an authoritative grant, not derived membership
state. A future purchase handler can insert a grant idempotently after verifying
its purchase; there is no payment or self-grant endpoint in this slice.

### Expiry and failure

Orbit consumes the existing server-authenticated Accounts public-profile source,
including its bounded cache and explicit expiry. It stores no duplicate supporter
flag or billing records. Known non-supporter observations and failed/unavailable
lookups are distinct. Unexpired evidence can be used; expiry is never extended
on failure. Permanent grants work even if Accounts is unreachable.

Saving or equipping a restricted design requires current eligibility. The
transaction rechecks evidence expiry against PostgreSQL's wall clock after
acquiring its lock; accelerated universe time does not control subscriptions.
Known ineligibility returns 403; unavailable evidence returns 503. No database
transaction or connection is held while waiting on Accounts.

Loss of eligibility changes only the derived displayed appearance to Wayfinder.
The selected design, its colors, and its equipped reference remain untouched;
fresh membership evidence or a permanent grant restores the appearance. The
browser expires observations while open and checks again on visibility changes.
Cosmetic outages do not add a gameplay dependency; existing OIDC session checks
continue to enforce their own authentication rules.

### Storage and delivery

The application defines a small `AssetStore` interface. `orbit-storage-assets`
adapts it to local files or S3-compatible object storage using the pinned Apache
`object_store` library. Simulation has no storage, image, or subscription dependency.

Unbought's intended production configuration uses a dedicated private S3 bucket
in us-east-2 and runtime IAM credentials. Self-hosters can mount a directory for
a single-host server or supply their own S3 endpoint. Multi-host deployments
must use S3-compatible storage. There is no filesystem replication, host-count
detection, or shared-disk coordination feature.

The four original, trusted SVG symbols ship with the binary. API startup
idempotently writes and verifies them through the configured store under keys
containing their SHA-256 content hash. Publication does not first inspect missing
keys, so S3 bucket-list permission is unnecessary. Multiple replicas publish identical bytes. A failed
publication refuses startup; workers do not initialize cosmetic storage.

The browser loads those stored assets through Orbit's same-origin media route.
The route accepts only safe symbol identifiers and SHA-256 filenames in the
reserved trusted-originals namespace, checks the stored bytes against that hash,
and returns SVG with `nosniff`, restrictive CSP, and immutable
cache headers. Store failures return a non-cacheable 503. Catalog artwork is
public; eligibility controls equipping it, not downloading it. Old and new immutable revisions remain readable during rolling releases. Only
operator-published originals may be written into this namespace. Player recipes and
eligibility responses are private and `no-store`.

Recipes contain only version 1, a catalog symbol ID, and two literal RGB colors.
The browser uses the SVG as a mask, so recoloring needs no new image file. Resolved
URLs and effective/fallback appearances are projections, not persisted state.
Stable symbol IDs and recipes are independent of bucket names and delivery hosts.

Bundled planet artwork continues to use the existing offline responsive WebP
pipeline. Uploads, runtime raster transformations, generation queues, and a CDN
are future work. Uploads must add validation, quotas, removal, provenance, and
retention policy before accepting untrusted content. Do not reuse this trusted
SVG publication route as an arbitrary upload endpoint.

### API, state, and isolation

`POST /api/v1/universes/{universe}/insignias` supports Load, Save, Equip, and
Delete. It uses normal session/machine authentication, cookie origin/CSRF checks,
and current membership/epoch binding. Save validates catalog IDs, colors, a
1–40-character name, and an optimistic revision. Collections are limited to 32
designs, with account locking to enforce that limit under concurrent writes.
Save-and-equip is one transaction. Conflicting/uncertain retries are reconciled
by reloading the library; no blind optimistic save confirmation is displayed.

The browser keeps server observations in a session-owned Zustand store and only
user drafts/selection IDs in component state. Mutation completion refreshes the
existing player-profile controller. Other clients refresh at the existing profile
cadence (at most one minute while watching); there is no new gameplay event or
simulation revision for a cosmetic edit.

The authorized player-profile projection includes effective insignia appearance
only when the client sends `X-Orbit-Insignia: 1`. Older strict-schema clients
continue to receive their original response shape; older servers ignore the
header during rolling deployment.
It uses the same visible-player boundary as names and supporter recognition. The
initial visual consumers are Settings and Galaxy. Public shared reports do not
receive insignia or new identity fields, preserving anonymization. Historical
appearance revisions and richer battle-report presentation are deferred: a
future historical report must reference an immutable authored revision and apply
its disclosure policy to insignia as well as names.

## Consequences and validation

Self-hosters own their complete collections and files, and the official game can
add supporter content without coupling Accounts to game themes. Independent
subscriptions, permanent grants, and authored choices have one source each.

There is one new storage dependency for API startup and media delivery, and one
new deployable storage adapter crate. Backups must include PostgreSQL and the
asset store. Restoring files alone cannot restore ownership or selections.

Tests cover pure access rules and expiry, authenticated HTTP plus PostgreSQL
persistence/ownership/CSRF/epoch checks, actual Accounts-client observations,
permanent grants through outages, unchanged simulation state, filesystem
restart persistence, signed S3-compatible HTTP operations, browser editing and
failure recovery, and desktop/mobile visual review. S3 protocol tests use a local
fixture endpoint; they are not a claim of deployment or a live AWS acceptance run.

The explicit-only `make test-insignias-live` target exercises the browser against
a real Rust server, isolated PostgreSQL database, and asset directory, including
persistence across API restart. It is not part of routine CI.

See [operator setup](../operations/empire-customization.md).
