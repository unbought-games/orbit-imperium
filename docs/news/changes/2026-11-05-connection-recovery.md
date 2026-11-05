---
id: connection-recovery
title: Quieter connection recovery
date: '2026-11-05T14:00:00Z'
---

Returning to the game or recovering from a brief failed request no longer means
an immediate “Connection lost” warning. The game checks whether it can refresh
your empire, keeps your current screen and edits, and reconnects in the background.

You’ll still see when you’re offline, when the game can’t refresh, or when an
order hasn’t been confirmed. Unconfirmed orders keep their Retry order action.

Thanks to [Gh0stP1rate](https://discord.com/users/343178308164255744) for
[reporting the frequent notices](https://discord.com/channels/1559681008532586586/1560363739818098738/1567745828959817873),
and to Ethan Mick for confirming the problem.

This fix is included in source builds after 0.6.0. Availability on your server
depends on its deployment.
