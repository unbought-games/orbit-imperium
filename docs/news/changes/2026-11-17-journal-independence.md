---
id: journal-independence
title: Retire full-state transition snapshots
date: 2026-11-17
---

Game execution now uses accepted commands and scheduled events to recognize
completed work and preserve retries. It no longer writes repeated full-state
transition snapshots. Current game state, receipts, reports and update delivery
remain transactional. Operators can deploy this compatible bridge before a
separate reviewed migration removes the unused table.
