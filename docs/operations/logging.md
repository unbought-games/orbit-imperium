# Structured operational logging

Set `ORBIT_LOG_LEVEL=error|warn|info|debug` in the server environment; omission
means info. Levels are thresholds and case insensitive. Debug is the richest
level; trace/off/filter expressions are rejected. The selected level persists
until changed. Restart the process or recreate the API/worker containers after
changing their environment. This does not change metrics, gameplay or analytics.

Serving emits one JSON object per stderr line, with timestamp, uppercase level,
event, release, role and selected structured fields. Optional `ORBIT_RELEASE`
identifies an immutable deployment; omission uses the package version. A 40/64
hexadecimal commit or `sha256:<64 hex digits>` is accepted. For an image reference,
only its `@sha256:` digest is logged; registry/repository/user-info text is discarded.
Invalid values fall back to the version without echoing the value. A deployer should
set it from the image identity. The local CLI's command output remains on stdout.

- Error identifies unexpected failures and blocked execution. Warn identifies
  recoverable operational problems. Driver messages, SQL values and arbitrary
  error text are excluded.
- Info records startup/draining, acknowledged admissions, transition outcomes
  and publication summaries. Gameplay rejections recorded at commit are ordinary
  `rejected` outcomes. Reads/polls and foreground presence are debug-only.
- Debug adds HTTP summaries using route templates, engine decisions, ordering
  context, manufacture quantity, changed-record counts and selected proposed
  body resource values/revision. It never serializes full game state, private RNG
  material, credentials, cookies or private messages. Third-party tracing targets
  stay excluded so enabling debug cannot turn on protocol/wire dumps.

`command_admitted` joins a client `command_id` to an internal `input_id`; the
worker logs the latter, plus universe and action. These IDs are not interchangeable.
The paired foreground-admission path records both mappings, with presence at debug.
A replayed request can reuse an older mapping; absence from finite log history
never implies that the command did not execute.

`game_engine_decision` describes a proposed result with
`commit_outcome=not_attempted`. `game_transition_committed` is emitted only after
the store acknowledges its result, with `outcome=applied|rejected` from the command receipt (or `completed` when no
command receipt exists) and
`commit_outcome=acknowledged`. Failed commit calls use `stage=commit` and
`commit_outcome=unknown`: a missing acknowledgement is not proof of rollback.
Runtime resolution errors cover failures outside that commit boundary and may
also accompany a more precise commit record. Neither logs nor their absence are
an idempotency/analytics source or a substitute for current database state.

## Delivery and metrics

A standard tracing-appender worker owns stderr writes, with an 8,192-line lossy
queue. When stderr stalls, the caller drops excess diagnostic lines instead of
blocking gameplay. `orbit_log_dropped_lines_total` reports this process-local
counter on the existing metrics endpoint, independent of verbosity. Existing
request/admission/runtime counts and timers remain independent of the subscriber.
No per-command or player metric labels are introduced.

Self-hosters must configure their log runtime's rotation and retention. For Docker,
use `json-file` with `max-size: 10m`, `max-file: '3'`, `mode: non-blocking`, and
`max-buffer-size: 4m`, or their existing bounded equivalent. Asynchronous host
collection can forward those files; the application never calls a remote logging
service. Protect logs because correlation and gameplay values are private
operational data. Keep remote retention finite and preserve only selected incident
evidence. Loss/duplicates are possible on saturation, crashes, host loss and
rotation/removal before collection. Suppressed or expired debug cannot be queried.

## Extension interface

`orbit_application::orbit_log!(LEVEL, event = "fixed_name", ...)` adds the fixed
`orbit` target, release and role and lazily evaluates fields. Use static vocabulary,
typed IDs, and selected numeric values. Never add `?claim`, `?snapshot`, payloads,
raw error formatting or serialized `WorldFacts`/`GameState`/`WorldChanges`.

`diagnostics::admitted(universe, command_id, input_id, action)` belongs **after**
admission COMMIT acknowledgement. `diagnostics::commit_result(&OrderedInput,
&Result<CommitOutcome, StoreError>)` is the callable serial/scoped application
commit boundary; preserve its post-ack placement when changing storage internals.
`diagnostics::engine_decision` runs inside the CPU executor after transition,
and `diagnostics::resolution` runs at runtime completion. No journal reader/writer
or state-transition semantics are changed by these calls. New expensive debug
projections must first check `tracing::enabled!(target: "orbit", Level::DEBUG)`.

See [verification](../verification/structured-logging.md) for local evidence and
remaining production acceptance.
