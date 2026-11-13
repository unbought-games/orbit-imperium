---
id: report-read-scope
title: Mark the reports you're looking at as read
date: '2026-11-12T20:00:00Z'
---

We've changed **Mark all as read** to **Mark shown as read**. On the Reports
page, it marks the reports already loaded in your current filtered list. In the
command orb, it marks the reports shown there. Other reports stay unread.

The server now applies the change directly in the database, so the action no
longer downloads your entire report history before trying to mark it read.
Stars, shared links, and archive choices stay intact.

This change is included in source builds after 0.6.0. Availability on your server
depends on its deployment.
