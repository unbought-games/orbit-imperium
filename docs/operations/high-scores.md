# High Scores rollout and daily snapshots

Deploy the schema and new API and worker binaries through the normal upgrade.
Existing players receive their exact score as gameplay changes their assets or
the backfill initializes their row. New players start with an initialized score.
Run the following from the deployed image with its application database
configuration. Use the UUID from `orbit universe list`, and repeat for each
universe that has world gameplay.

```sh
orbit rankings backfill --universe "$UNIVERSE_ID"
orbit rankings snapshot --universe "$UNIVERSE_ID"
```

The backfill commits up to 32 players at a time, prints progress, and can run
while the game is live. Restart the same command after an interruption. Once
every current member has a score, open High Scores to verify player and alliance
standings. The snapshot command captures today's standings at the actual UTC
sample time. A worker may already have completed it; either outcome is success.

If an older worker resumes inventory writes after rollback, its writes do not
maintain the score field. Before resuming the new readers, stop the old writers
and mark affected players' scores uninitialized. If the affected players are
unknown, mark that universe's scores uninitialized and rerun the backfill.
Keeping the new schema during a rollback preserves the original asset lots.

## Daily operation

A worker or combined-role server checks on startup and once a minute for a
missing snapshot for the current UTC date in each world universe's current
epoch. Each worker captures at most one universe at a time. The first completed
capture wins, even if an operator and another replica attempt it together.
Failure leaves the preceding baseline available and the worker retries on its
next scan. A late manual capture uses today's date and the actual sample time.
The next UTC day can use the launch snapshot for movement.

## Monitoring and recovery

The private metrics endpoint exports `orbit_ranking_snapshot_missing{universe}`.
A value of 1 means today's snapshot is missing and 0 means it is complete. The
gauge reads PostgreSQL independently of the scheduler and is available on API
and worker replicas. Allow a few minutes after midnight or startup to capture
the standings. For Prometheus, load the [daily snapshot alert rule](high-scores.rules.yml)
and route warning alerts to the operator through the site's existing alert
receiver. Monitor metrics-target availability as well so a failed scrape is visible.

When the alert fires, check that a worker is running, look for
`ranking_snapshot_scan_failed` or `ranking_snapshot_failed` in its logs, and
check that the score backfill completed after an upgrade. Correct the reported
failure, run the snapshot command above, and verify the gauge returns to 0.
