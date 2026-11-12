---
id: cancelled-transaction-cleanup
title: Safer database request cancellation
date: '2026-11-12T06:36:00Z'
---

Cancelled database requests no longer leave an unfinished transaction for the
next request using the same connection. A transaction that finishes opening after
its caller leaves is rolled back before reuse. Committed game actions remain
committed, while unfinished work is rolled back.
