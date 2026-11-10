---
id: runtime-announcements
title: Server announcements without a rebuild
date: '2026-11-09T23:00:00Z'
---
Server operators can now publish, edit, withdraw and restore the command orb's
“what's new” messages without rebuilding or restarting the game. Write Markdown
with a title and publication date, then use `orbit announcements publish`.

Local files work by default. Servers using S3-compatible asset storage can use
the same commands and storage configuration. Each server controls its own feed;
self-hosted games do not fetch announcements from Unbought Games.

The orb keeps its existing appearance and remembers which messages you have
already dismissed. Announcement delivery runs independently of gameplay.
