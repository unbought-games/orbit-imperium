Operators can select error, warn, info or debug logging with `ORBIT_LOG_LEVEL`.
Info is the default. Structured action records connect admissions to execution,
while debug adds selected troubleshooting detail without dumping private game state.
Logging uses a bounded asynchronous writer and does not control routine metrics.
