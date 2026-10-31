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

Permanent grants are Orbit-owned records in `insignia_grants` keyed by local
account UUID and stable catalog symbol ID. A future verified purchase can write
one grant using `ON CONFLICT DO NOTHING`. For an intentional operator grant,
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
