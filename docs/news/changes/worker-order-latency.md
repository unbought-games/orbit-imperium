---
id: worker-order-latency
title: Measure what happens after an order is accepted
date: '2026-11-25T12:00:00Z'
---

Server operators can now follow a fleet dispatch from durable acceptance through
its worker claim and final commit. Private metrics show time spent loading facts,
waiting for and running the engine, revalidating and writing changes, and waiting
for PostgreSQL to acknowledge them. The worker also counts inventory rows and
records scheduler waits while inputs are active. Dispatch diagnostics include
the time spent waiting for and holding the universe-wide alliance lock during
both admission and commit.

The [worker latency guide](../../operations/request-latency.md#worker-latency-after-durable-acceptance)
includes a report for comparing foreground and machine orders in both execution modes.
