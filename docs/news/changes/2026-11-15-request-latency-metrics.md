---
id: request-latency-metrics
title: Request and action latency diagnostics
date: '2026-11-15T21:32:00-05:00'
---

Server operators can inspect API response times by route, action and outcome,
including ship orders, building upgrades and fleet dispatches. Private diagnostics
show recent slow calls with authentication, database-pool, ordering and admission
commit timings. Durable admissions and retries are counted separately, including
orders whose response failed after the database committed them.

The metrics contain no player identities or request payloads. Hosted collection,
dashboards and latency alerts require separate configuration; this change does
not alter game ordering or add client-side tracking.
