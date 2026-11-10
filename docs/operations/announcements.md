# In-game announcements

Operators can publish curated “what's new” bubbles without rebuilding or
restarting Orbit. The browser reads its own server's `/api/announcements` feed.
There is no dependency on an official feed. A server with no published feed shows
no announcement. This replaces the former build-time React catalog; existing
acknowledgments retain their IDs and are not reset during migration.

## Author and publish

Use the same `orbit` binary as the server. These commands need only asset-storage
configuration, not `DATABASE_URL` or a running game database.

```sh
orbit announcements validate ./announcement.md
orbit announcements publish ./announcement.md
orbit announcements list
orbit announcements withdraw new-research
orbit announcements restore <revision-sha256>
```

`publish` inserts or edits one stable ID while retaining other entries. `withdraw`
removes that ID from the active feed and is safe to repeat. `list` prints the
current feed and revision. `restore` activates a retained complete feed revision.
Publishing prints the previous and resulting revisions; retain them for recovery.
A concurrent update fails rather than silently replacing another operator's work.
Inspect `list` before retrying a conflict or an interrupted publication. Historical
feed objects are immutable and retained after withdrawal or restoration.

Write a Markdown file with YAML frontmatter:

```markdown
---
id: research-network
title: The research network is here
date: '2030-01-01T12:00:00Z'
until: '2030-01-31T12:00:00Z'
href: /updates/research-network.html
image:
  src: /art/research-network.webp
  alt: Connected laboratories
---
Link your laboratories so your planets research together.

- Each level links another eligible laboratory.
- **Research finishes faster.**
```

Use your actual publication date and only links/artwork served by your deployment.
`until`, `href`, and `image` are optional. Without `until`, the window is 30 days.
The ID, title, date and body are required. Unknown metadata and duplicate IDs are
rejected. The feed permits 64 entries, each with up to 16 KiB of Markdown, and a
1 MiB total size. Withdraw expired entries when you reach the entry limit.

Raw HTML is displayed as text. Markdown supports ordinary formatting, lists,
links and images; links/images must use HTTPS or a root-relative path. Scripts,
embedded HTML, forms, and arbitrary React components are not supported. Keep
copy short and check the actual bubble on desktop and mobile. An image's empty
`alt` marks it decorative. Artwork references must remain available independently
of subsequent client builds. The feed does not publish the full `href` page or
upload artwork: host those first, or omit the optional fields.

## Local files (default)

With no storage settings, the API and commands use `data/assets`. Run the command
from the same working directory or set an absolute path explicitly:

```sh
ORBIT_ASSET_DIRECTORY=/var/lib/orbit/assets orbit announcements publish ./announcement.md
```

For containers, persist that directory in a volume and mount the same volume into
any one-off CLI container. Mount your Markdown file read-only as well. Run the CLI
with the same user/permissions as the API. Local publication uses a filesystem
lock and atomic replacement; use a local filesystem with normal file-lock and
rename semantics. All API instances must read the same storage.

## S3-compatible storage

Use the same settings as other Orbit assets:

```sh
export ORBIT_ASSET_STORE=s3
export ORBIT_ASSET_S3_BUCKET=your-orbit-assets
export ORBIT_ASSET_S3_REGION=your-region
# Optional custom S3-compatible endpoint:
export ORBIT_ASSET_S3_ENDPOINT=https://storage.example.com
orbit announcements publish ./announcement.md
```

Use workload identity or AWS credential environment variables
(`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `AWS_SESSION_TOKEN` when needed).
The adapter does not load a shared AWS profile merely from `AWS_PROFILE`. Never put credentials in the Markdown or feed. `ORBIT_ASSET_S3_ALLOW_HTTP=1` is
available for explicitly configured local development endpoints. Production
endpoints should use HTTPS. The backend must support conditional object writes
(`If-Match` and `If-None-Match`); unsupported writes fail rather than fall back to
unsafe overwrites. Endpoint compatibility must include these operations, not just
ordinary GET/PUT. Delete permission is not required. Once the active pointer and
its feed exist, the runtime needs only object-read permission and a publisher
needs object-read/write permission.

### First publication on AWS S3

AWS returns **403 Access Denied**, rather than 404 Not Found, for a missing object
when the caller lacks `s3:ListBucket`. Consequently, an uninitialized store read
with object-only permissions produces a storage error and HTTP 503, not an empty
feed. This also prevents the publishing CLI from loading the initial feed.
The adapter deliberately does not treat permission errors as an empty store.
See [AWS GetObject permissions](https://docs.aws.amazon.com/AmazonS3/latest/API/API_GetObject.html).

Before enabling the first runtime-feed consumer, use an authorized operator
identity that can distinguish absence to inspect `announcements/current.json`.
Preserve an existing valid feed. If the pointer is absent, initialize a valid
feed before deployment, even when no announcement content is requested. Do not
publish sample content merely to make the endpoint healthy.

An operator can bootstrap an empty store with conditional object writes:

1. Serialize the empty feed as `{"schema":1,"announcements":[]}` without a
   trailing newline. Compute the SHA-256 of those exact bytes.
2. Create `announcements/feeds/<sha256>.json` with those bytes and
   `If-None-Match: *`. Read it back and verify the hash. If the immutable key
   already exists, verify its exact bytes; never overwrite it.
3. Create `announcements/current.json` containing
   `{"schema":1,"revision":"<sha256>"}` with `If-None-Match: *`. If another
   publisher created the pointer, stop and inspect it; never replace it as part
   of initialization. Retain any unreferenced immutable object.
4. Read back the pointer and feed using the runtime identity. After enabling
   the consumer and allowing its 60-second cache to refresh, verify the exact
   server image's `orbit announcements list` and public `/api/announcements`
   return the same revision and zero announcements.

This establishes the normal existing-object path without granting the runtime
bucket-list permission. Object access denial, invalid JSON, hash mismatch and
missing referenced feed objects remain errors to investigate. HTTP 503 from this
optional endpoint still counts as a service failure even if game readiness passes.

The API needs `GetObject` on `announcements/*`. The publishing identity needs
`GetObject` and `PutObject` there. Objects are stored at
`announcements/feeds/<sha256>.json`; `announcements/current.json` points to the
active revision. Buckets can stay private: only the game API accesses storage.
Do not grant browsers storage credentials. Feed contents are public editorial
content, so never include player-private information or secrets.

## Timing, availability and releases

The API caches the feed for 60 seconds and returns an ETag. Browsers revalidate
when opening the game, returning to a visible tab, focusing the window, and every
60 seconds while visible. Allow roughly two minutes for active players to observe
a publication or withdrawal. Storage errors are briefly cached and suppress the
bubble; gameplay and game readiness are independent of feed availability. A
subsequent successful refresh recovers without a restart.

The newest active, unseen entry appears first, after threats and tutorial content
release the orb. Closing it records its ID per account in that browser. Changing
copy under the same ID does not show it again. A new ID represents a new message.
Announcements published before an empire joined are not shown to that empire.

Prepare content before a release, but publish only after deployment and any
required gameplay activation succeed. Do not use a future clock time as proof
that the feature will be ready. A delayed release should also delay publication.
When rolling back a feature, withdraw its announcement or restore a compatible
feed. Application rollback alone does not roll back independently stored news.

During migration from the bundled catalog, publish only still-relevant entries
with their original IDs and dates to preserve dismissals and eligibility. Do not
replay old announcements by changing those fields. Old clients already loaded in
a browser continue using their bundled catalog until they update.
