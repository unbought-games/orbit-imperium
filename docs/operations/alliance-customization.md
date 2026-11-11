# Alliance customization and uploads

Alliances have a shared identity, a members' Hall, and public recruitment pages.
Customization is free and belongs to the alliance. `EditProfile` controls
presentation editing and media management through the existing delegated role
model. `ManageRecruitment` continues to control admission rules and invitations.

## Upgrade and storage

Apply migration `0042_alliance_presentation.sql` with the matching server. It adds
versioned JSONB presentation/template documents, upload lifecycle records, and
recruitment intent on arrival records. Existing alliances use the free defaults;
their names, tags, descriptions, membership, and permissions retain their sources.
There is no content backfill or paid catalog download.

The same application and API work with both existing asset backends:

```sh
# One host: persist this directory and include it in backups.
ORBIT_ASSET_STORE=files
ORBIT_ASSET_DIRECTORY=/data/assets

# Multiple hosts: use shared S3-compatible storage instead.
ORBIT_ASSET_STORE=s3
ORBIT_ASSET_S3_BUCKET=your-orbit-assets
ORBIT_ASSET_S3_REGION=your-region
# Optional: ORBIT_ASSET_S3_ENDPOINT=https://your-object-store.example
```

Keep the existing cosmetic catalog configuration. Uploads use the separate
`alliance-media/v1/` namespace. Grant the application GetObject, PutObject, and
DeleteObject on `alliance-media/*`; keep catalog and announcement deletion rights
separate. No public bucket access, bucket listing, browser S3 credentials, or S3
CORS configuration is needed. Writes use conditional create; deletion uses the
ordinary single-object S3 API for compatibility across providers.

Community and hosted servers use the same limits and routes. Operators can set:

| Variable                       | Default               | Supported range                                        |
| ------------------------------ | --------------------- | ------------------------------------------------------ |
| `ORBIT_ALLIANCE_UPLOADS`       | `1`                   | `0` disables new uploads; saved artwork still displays |
| `ORBIT_ALLIANCE_FILE_BYTES`    | `20971520` (20 MiB)   | 1 through 20 MiB                                       |
| `ORBIT_ALLIANCE_STORAGE_BYTES` | `209715200` (200 MiB) | At least one file, up to 10 GiB per alliance           |
| `ORBIT_ALLIANCE_IMAGE_COUNT`   | `50`                  | 1 through 1,000 live/reserved assets per alliance      |

The storage budget counts current assets and unexpired reservations. The server
reserves the processed output size before writing bytes, so concurrent uploads or
an image that grows during normalization cannot bypass that budget. Limits are
returned to the editor, rather than relying on browser checks for enforcement.

JPEG, PNG, GIF, and WebP are accepted after bounded decoding. GIF/WebP animation
is preserved. The decoder limits dimensions to 4096 per side, animation to 300
frames, and total decoded animation work to 64 megapixels. Animated PNG is
explicitly rejected rather than silently flattened. Arbitrary SVG, HTML, video,
and remotely fetched image URLs are not upload formats. The crest builder uses
installed free vector elements instead.

## Ownership, privacy, and recovery

An upload reserves an alliance-owned media ID, transfers through Orbit, and is
finalized only after permission and epoch checks. Saving presentation references
is separate from uploading. A failed transfer can retry the same ID without
creating another image. Expired or revoked uploads cannot be attached.

Public access is derived from shared identity and the selected public template.
Hall-only images require membership. Unattached images and images referenced only
by inactive templates require editing permission. Public responses omit private
Hall text, inactive templates, upload metadata, and storage keys. File routes
recheck live access and do not expose the bucket directly.

Switching templates retains every saved template document. Deletion refuses an
image referenced by any saved template, shared identity, or the Hall; detach it
and save first. Disband/reset writes deletion intent before live alliance data
is removed. Leadership changes never transfer assets into a player's ownership.

Run cleanup explicitly with the same database and asset environment as the API:

```sh
orbit alliance-media cleanup
```

It reconciles expired reservations and deletion tombstones with blob storage.
It is idempotent and does not delete active media, catalog originals, or
announcements. This feature does not install a scheduler or change retention.
Keep cleanup failures visible to operators and rerun after restoring storage
access. Retained tombstones also allow reconciliation of a late failed transfer.

For a versioned object store, DeleteObject ordinarily creates a delete marker;
retained versions can remain billable. The application library quota is not a
measurement of provider-retained versions. Decide backup/version retention
separately; no DeleteObjectVersion permission or automatic expiry is required by
the application.

Back up PostgreSQL and asset storage together. Uploads cannot be recovered from
the application image. Restore media IDs, ownership, receipts, and original keys
together; do not rewrite references to provider-specific URLs. Missing bytes use
display fallbacks while preserving saved selections. Changing storage providers
requires copying the original object keys, not rewriting alliance documents.

## Content and client compatibility

See [ADR 002](../architecture/adr-002-hosted-cosmetic-content.md). Supporter
originals remain separately distributed. The alliance builder uses free installed
elements and unrestricted composition; it does not confer personal supporter
membership or expose restricted originals. Anonymous symbol display is a raster
of a free symbol, not an anonymous route to private catalog sources.

New clients send `X-Orbit-Alliance-Presentation: 1` for alliance, ranking, and
player-affiliation reads and `X-Orbit-Arrival: 1` for arrival context. Existing
clients retain their prior response projections. Presentation writes are scoped
and versioned, with the existing command ID/revision semantics. Unsupported
template data is retained rather than silently replaced.

OpenAPI owns the wire contracts; the server's template registry supplies editor
fields and validation limits. Adding a template using the supported field kinds
requires a registry entry and renderer, usually without a database migration.
Keep changes to template schemas versioned. Do not persist rendered Markdown,
effective permissions, media visibility flags, or usage counters.

Recruitment intent is stored during local signup or account enrollment and can
resume in arrival without URL state. Applying/joining still requires an explicit
player action and the existing server rules. Arrival completion and membership
commands have separate retry semantics; an application can remain pending while
the player begins their briefing.
