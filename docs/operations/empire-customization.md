# Empire insignia operations

The design and access contract is recorded in [ADR 001](../architecture/adr-001-empire-customization.md).
The editor is in **Menu → Settings → Empire insignia**. The equipped insignia
appears beside the owner's name in Galaxy. No gameplay advantage is granted.

## Single-host self-hosting

Defaults require no external cosmetic service:

```sh
ORBIT_COSMETIC_ACCESS=unrestricted
ORBIT_ASSET_STORE=files
ORBIT_ASSET_DIRECTORY=/data/assets
```

The container defaults to `/data/assets` (native execution defaults to
`data/assets` relative to its working directory). Mount a persistent volume
there and make it writable by UID 10001. Preserve this volume when replacing
containers. The shipped Docker image prepares the directory for the Orbit user.
Back up the database and asset directory together.

Example addition to an existing Orbit Compose service:

```yaml
services:
  orbit:
    environment:
      ORBIT_COSMETIC_ACCESS: unrestricted
      ORBIT_ASSET_STORE: files
      ORBIT_ASSET_DIRECTORY: /data/assets
    volumes:
      - orbit-assets:/data/assets
volumes:
  orbit-assets:
```

**Multiple hosts must use S3-compatible storage.** Separate host directories do
not share assets. Orbit does not synchronize files, detect topology, or provide
filesystem failover. This is an operator responsibility.

## Unbought production / S3-compatible storage

Configure the API/combined process; worker-only processes ignore these settings:

```sh
ORBIT_ASSET_STORE=s3
ORBIT_ASSET_S3_BUCKET=<dedicated-orbit-assets-bucket>
ORBIT_ASSET_S3_REGION=us-east-2
ORBIT_COSMETIC_ACCESS=supporter
```

Retain the existing OIDC and `ORBIT_ACCOUNTS_PROFILE_CREDENTIAL` settings from the
[Accounts runbook](unbought-accounts.md). Supporter access refuses startup if the
profile integration is absent. Storage selection and supporter policy are
independent: S3 does not require Accounts, and local storage can use supporter
policy when explicitly configured.

For other providers, set `ORBIT_ASSET_S3_ENDPOINT=https://your-s3-endpoint` and the
provider's region. Requests use path-style bucket addressing. Standard
`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and optional `AWS_SESSION_TOKEN`
are supported. On AWS prefer runtime workload credentials, including EC2 IMDSv2,
instead of long-lived keys. Explicit `ORBIT_ASSET_S3_ALLOW_HTTP=1` permits an HTTP
endpoint for local testing; HTTPS is the default. Never include credentials in
an endpoint URL, source files, or logs.

The Unbought infrastructure repository should own a **dedicated private S3
bucket**, separately from release bundles and database backups. Keep public
access blocked, enable versioning/encryption and a backup/retention policy, and
grant the runtime role `s3:GetObject` and `s3:PutObject` on its `insignias/*`
prefix. The adapter does not need bucket listing or deletion for this slice.
Browsers access Orbit's media route, so no public bucket policy or S3 CORS rule
is required. This code change does not create AWS resources or deploy production.

API startup writes the three bundled free originals at their content-addressed keys
and reads them back to verify delivery. Repeated publication writes identical
bytes. This avoids depending on S3 bucket-list permission to identify an absent
object; [S3 can return 403 for missing keys without it](https://docs.aws.amazon.com/AmazonS3/latest/API/API_GetObject.html). Grant publication permissions before rollout. An asset
store error refuses startup rather than advertising a ready but empty catalog.
Existing API processes continue serving during preparation. Do not delete old
keys during a rolling release; old binaries can still reference them. Restrict
bucket access to the application/backup operators.

## Membership and permanent ownership

`unrestricted` exposes every supplied symbol without checking supporter status
for cosmetic access. It does not mark players as supporters. `supporter` exposes
the installed free items to everyone and installed supporter items to supporters
at tiers 1–3 or holders of permanent grants. Unrestricted only unlocks installed
items; it does not fetch or reveal official content.

Permanent grants are Orbit-owned records in `cosmetic_grants` keyed by local
account UUID, item kind and stable catalog item ID. The `insignia_grants` view
preserves legacy readers. Use the trusted award function described below for
idempotent new grants. For an intentional operator grant,
use parameterized SQL with the **verified local account ID**, the installed symbol ID,
and an audit reason. This is not a browser API and never uses a display name as
identity. Granting a symbol unlocks all its color combinations, not one saved
composition. Grant rows survive membership expiry and deleting a saved design.

Do not write supporter flags into this table. Subscription status remains an
expiring observation from Accounts. On expiry/unavailable verification the
selected design remains saved while the displayed appearance falls back. New
restricted saves/equips require fresh evidence or a permanent grant. Renewing
membership restores the selected design on the next profile refresh.

Deleting a design clears its equipment references across universes. Editing a
design updates every empire using that design. Repeated stale saves return 409;
reload the collection before retrying to avoid overwriting another tab's edit.

## Backup, move, and verify

Back up PostgreSQL (designs, grants, equipment, identities) and the configured
asset files/bucket. Copy object keys unchanged when changing storage backends;
stop cosmetic writes during the copy and switch all API replicas together.
Do not copy expiry caches. Bundled symbols can be republished from the matching
binary; future player originals will require their own durable backup.

After deploying/configuring a server:

1. Confirm API startup published the catalog without storage errors.
2. Create, recolor, save, and equip a design in Settings; reload and verify it.
3. Check Galaxy from another account; allow up to a minute for profile refresh.
4. Verify a free account cannot save/equip an installed supporter item, while an
   eligible supporter can. Verify expired membership preserves the saved design.
5. Verify a permanent grant remains usable without supporter evidence.
6. Restart the API and verify the collection and asset delivery persist.

Routine focused checks use `make test-insignias` and the existing disposable
database target `make _db-insignias` (configure the isolated Compose project and
published port as documented in the CI runbook). S3 adapter tests send signed
requests to a local fixture endpoint; validate the configured production bucket
and IAM permissions during an explicitly requested deployment.

`make test-insignias-live` is explicit-only browser acceptance against a native
server and disposable PostgreSQL database. It covers save/equip, Galaxy identity,
asset delivery, desktop/mobile captures, and an API restart; its script removes
its database and asset directory. It requires an isolated running Compose database.

## Separately installed catalogs

See [ADR 002](../architecture/adr-002-hosted-cosmetic-content.md). Community builds
include only three free originals. Place additional trusted originals in the
configured asset directory/bucket; never put proprietary content in the public
source or image build context. A version-1 manifest contains only additional items:

```json
{"version":1,"insignias":[{"id":"my-circle","name":"My circle","supporter":false,"sha256":"<64 lowercase hex SHA-256 of the SVG bytes>"}]}
```

Upload each SVG to `insignias/v1/<id>/<svg-sha256>.svg`. Hash the exact UTF-8 JSON
bytes (including any newline), then store the manifest at
`insignias/catalogs/<manifest-sha256>.json`. Set:

```sh
ORBIT_COSMETIC_CATALOG=insignias/catalogs/<manifest-sha256>.json
```

The same paths work beneath `ORBIT_ASSET_DIRECTORY` for filesystem hosting.
Unset this variable for a free-only server; no external service is contacted.
Choose your own catalog access policy. No Unbought assets, credentials, branding
rights or automatic official catalog downloads are supplied by this mechanism.

IDs are 1–64 lowercase letters/digits/hyphens; names are 1–64 characters without
controls. A manifest cannot override bundled IDs. Up to 256 extra items and
256 KiB of JSON are supported. SVGs are at most 64 KiB and accept static SVG
geometry (paths, shapes and groups), not scripts, events, stylesheets, external
references or uploaded player content. Use literal fills/strokes; the browser
renders the original as a monochrome mask with the player's chosen colors.

API startup verifies every manifest and original hash before readiness. A
configured-but-missing catalog fails startup; an omitted catalog deliberately
starts free-only. Missing selections and permanent grants stay saved and display
a free fallback. Reinstalling matching IDs restores their appearance. Workers
ignore the manifest. Installations sharing several API hosts must share a store
and deploy the same catalog key. Keep previous manifests and originals for rollback.

External artwork is delivered only to authenticated game clients, without a
supporter requirement for viewing. It is not publicly cacheable. Objects for
uninstalled IDs are not served even if they remain in the bucket. During rolling
updates, keep installed IDs needed by both versions; old immutable revisions of
installed symbols remain readable. For new catalog IDs, refresh old browser apps.

Unbought's private content repository owns its source catalog and publisher;
the infrastructure repository owns its bucket, credentials and pinned runtime
configuration. Publication does not restart or release Orbit. Publish verified
content before activating its pin in a controlled application release. An old
binary ignores the new setting and can be used for application rollback without
deleting assets or changing database selections.

## Layered insignias

The editor supports recipe version 2 alongside unchanged version-1 designs.
A layered design contains `layers: [{symbol, color}]` and the existing
`foreground` / `background` colors. The legacy `symbol` remains `compass` for
fallback. Layer geometry comes only from the installed catalog, never from player
SVG input. Rendering order is stripes, center, accents, regardless of click order.
The server permits one center, one accent and two distinct stripes. Free accounts
use one shared element color and no stripes. Fresh supporter evidence (or an
unrestricted self-hosted policy) enables stripes and up to three group colors.
Permanent symbol grants unlock those symbols, not membership-only composition
features. Expiry and removed catalogs preserve saved recipes and derive the
normal free fallback.

New catalog entries add `group: "center" | "stripes" | "accents"`; omitted group
means `legacy`, preserving old installed catalogs. Community distribution includes
16 independently authored free elements as well as the three legacy originals.
Additional supporter elements and stripes are installed separately using the same
immutable manifest/object flow above. Existing manifests remain valid. No database
migration is needed; recipes are already stored as JSONB. Do not delete old assets.

Deploy the API and new frontend together using the compatibility headers below.

### Layered recipes and background shapes

Version-2 recipes compose installed stripes, a center and an accent. Basic
backgrounds (shield, circle, rounded square, diamond and hexagon) are free for
every player. The optional `shape` field stores the authored choice; recipes
without it retain the original shield. Version-1 recipes remain unchanged.
Shapes do not grant access to restricted elements, stripe slots or group colors.
Empty element groups have no color to edit; selecting an element enables the
color control. Replacing an element retains that group's color, including both
stripe slots. Removing the last element removes its color along with it.

Current editors send `X-Orbit-Catalog: 3`. Earlier editors receive 409 rather
than loading a library they cannot faithfully edit. Profile clients send
`X-Orbit-Insignia: 4` to receive shapes; version 3 still receives unshaped layered
recipes, and earlier clients receive compatible free fallbacks. Saved recipes
and grants remain unchanged by fallback projection.

## Empire names, taglines and titles

Owners edit their active empire from **My Orbit profile → Explore this empire →
Edit identity**. Empire names (60 Unicode characters) and taglines (160) are plain
text and free for everyone. Empty fields use the normal game defaults. Names are
not unique account identifiers. The username stays visible. Titles are selected
independently for each empire; permanent unlocks belong to the local account.
Removed or concluded empires retain their identity as readable archives.

Community builds include Commander, Captain, Admiral, Marshal, Governor,
Chancellor, Consul, Director, Overseer, Steward, Navigator and Explorer. Official
supporter title definitions are distributed separately, never in community builds.

Version-1 insignia manifests remain supported. Version 2 adds an optional `titles`
array alongside `insignias`. This independently authored example is a free fixture,
not an official supporter title:

```json
{"version":2,"insignias":[],"titles":[{"id":"sample-curator","label":"Sample curator","address":"Curator","access":"free"}]}
```

Each title has a stable 1–64-character lowercase/digit/hyphen ID, nonempty `label`
and `address` strings of up to 40 characters, and `access` set to `free`,
`supporter`, or `earned`. Control characters and bidi override/isolate characters
are rejected. Up to 256 additional titles are allowed. Duplicate and bundled IDs
cannot be replaced. The entire immutable manifest remains bounded to 256 KiB and
uses the existing `insignias/catalogs/<sha256>.json` pin. Titles need no SVG object.

- `supporter`: free titles, fresh supporter access, and permanent grants apply.
  Supporter membership never unlocks earned titles.
- `unrestricted` (default): installed supporter cosmetics are available without
  Accounts. Earned titles still require a permanent grant.
- `all`: explicitly unlock every installed cosmetic, including earned titles.
  This creates no achievement facts, supporter badges, or permanent grants.

A saved title survives membership expiry and catalog removal. The effective title
falls back to Commander until access returns. Owners can still edit their name
and tagline while retaining an unavailable title. Changing to a different locked
or missing title is rejected. Viewing another player's title does not require
membership. The title library is only returned to the owner.

### Permanent awards

Migration 0037 generalizes existing grants into `cosmetic_grants`, keyed by
`(account, kind, item_id)`, retaining `granted_at`, `reason`, and `source`.
`insignia_grants` remains an updatable compatibility view for older readers and
simple operator inserts. There is one underlying grant table. Use the trusted
`orbit_storage_postgres::grant_cosmetic` function inside an authoritative award
transaction. Pass the verified local account UUID, item kind (`title` or
`insignia`), stable item ID, stable source event reference, and audit reason.
The first award wins; retries do not duplicate or rewrite provenance. There is no
browser grant endpoint. Never award based on client-supplied achievement claims.
Awards may refer to temporarily absent content and survive membership removal.
A future achievement evaluator calls this hook after verifying its own criteria;
this release does not fabricate achievements or backfill unverifiable awards.

### Compatibility, history and rollout

New clients negotiate identity fields with `X-Orbit-Identity: 1`. Older profile
and dossier clients retain their original response shape. New clients accept old
responses and hide the editor when its title library is absent. Deploy migration
0037 and the new binary/frontend before pinning a version-2 manifest. Older API
binaries cannot load version-2 manifests: retain the previous catalog pin for
rollback. Never delete prior objects during rollout.

Identity observations are retained from the time they are authored. Historical
facts capture event-time empire text and selected title references, including
recipient-visible combat participants. Current edits do not rewrite those facts;
older unknown identity remains unknown. Saved choices and awards reference stable
IDs rather than copying separately distributed content into application artifacts.

Focused checks: `make test-empire-identity`; disposable database checks:
`make _db-empire_history _db-insignias _db-empire_history_upgrade` using the standard
isolated Compose configuration. Back up the database and pinned catalog together.
