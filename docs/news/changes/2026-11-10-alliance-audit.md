---
id: alliance-audit
title: A readable alliance audit log
date: '2026-11-10T16:02:00-05:00'
---

Alliance activity now appears in a compact table showing the player, action,
target, and date and time. Targets use player names, role names, and notice
titles instead of UUIDs. On phones, targets sit beneath their actions.

New audit entries keep role names and notice titles even after those objects
change or are deleted. Older entries use surviving records and application
history where possible, with readable fallbacks when the original target is
unavailable. New pin, role, and invitation events also describe the specific
action instead of showing an internal command name.
