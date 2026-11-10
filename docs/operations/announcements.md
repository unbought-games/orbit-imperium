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
ordinary GET/PUT. No bucket-list or delete permission is required.

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
