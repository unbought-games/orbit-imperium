# ADR 002: Separate hosted cosmetic content from community distribution

Status: implemented, 2026-10-31. Supersedes ADR 001's bundled supporter catalog
and anonymous delivery of external artwork. Ownership, grants, per-universe
selection and subscription evidence remain unchanged.

## Problem and evidence

The first insignia slice compiled all four originals into the public binary.
Startup copied those originals to the configured store. S3 was a delivery and
persistence backend, not a private content source. The infrastructure setup and
release followed that documented contract, including checking all four assets.
It therefore did not create a boundary between public and official content.

Community releases now contain only the free Wayfinder, Starwing and Ascendant
originals. Additional content is supplied independently. Unbought maintains its
hosted originals and authoring metadata outside the public source, images,
fixtures and frontend bundles. Laureate retains its stable `laurel` ID and exact
legacy bytes in the separately supplied catalog. Removing it does not withdraw
its previous CC BY-SA grant or rewrite public Git history.

## Installed content and eligibility

An immutable catalog is authoritative for which items are installed. A server
starts with the three free items; optionally `ORBIT_COSMETIC_CATALOG` names
`insignias/catalogs/<sha256>.json` in its configured AssetStore. The manifest's
bytes must match that hash. Version 1 contains at most 256 additional insignia
entries: `id`, `name`, `supporter`, and `sha256`. IDs cannot replace bundled
items or collide. The application validates identifiers, metadata and hashes.

Each original is stored at `insignias/v1/<id>/<sha256>.svg`. API startup reads
and verifies every declared object and validates bounded static SVG geometry.
It never creates or overwrites externally supplied originals. Missing objects,
invalid manifests or hash mismatches fail preparation before readiness. Workers
ignore cosmetic configuration. Catalog changes require a new manifest key and
API restart/deployment; no mutable `latest` pointer or background catalog cache.

No manifest means a free-only catalog, even if old objects remain in storage.
Only installed items participate in the existing union of free, unrestricted,
permanent grant and supporter access. Unrestricted never discovers/downloads
Unbought content. Community operators can supply their own manifests and files
using the same public implementation without Unbought services.

Keep saved recipes and grants when a catalog disappears. Reads preserve those
IDs, but derive the displayed free fallback. Attempts to save/equip a missing
item return 404. The editor explains missing installation separately from
supporter access or temporarily unavailable evidence. Reinstalling the item
restores display without changing player data. No database migration is needed.

## Delivery and client compatibility

Bundled artwork remains publicly cacheable. External artwork requires a valid
Orbit session/machine identity and uses `private, no-store`; it does not require
supporter eligibility to view, because players must see each other's empires.
The server only serves installed IDs, including retained hash revisions for an
installed item during rolling updates. Unlisted leftover S3 keys return 404.
Public shared-report anonymization remains unchanged. Browser delivery cannot
prevent copying and is not a promise of exclusivity over short words/phrases.

New editors send `X-Orbit-Catalog: 1`. Old editors receive 409 for installed
catalogs containing IDs outside their original enumeration and should reload
the application. New profile clients send `X-Orbit-Insignia: 2`; version 1
clients receive free fallback for new IDs, and clients without the header retain
their original profile shape. New clients work with the old server response.

## Operations and validation

The same open-source binary runs both deployments. Official content publication
is separate from application builds and uses the existing private S3 bucket.
Publish/verify originals first, then the immutable manifest. Pin its key in the
official application configuration and retain `supporter` policy. Existing
`insignias/*` credentials already cover the manifest; no new bucket is needed.
Keep historical objects and prior catalog pins for rollback. Independent server
operators use a local asset directory or their own S3-compatible store.

Public tests use an independent freely licensed test symbol, never hosted
originals. Coverage includes manifest opt-in/hash validation, unavailable assets,
static SVG restrictions, eligibility, retained selections/grants, authenticated
media, unlisted objects, client compatibility, desktop/mobile missing-content
recovery, and a community-source packaging regression.
