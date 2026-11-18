# Command admission and recovery

A submitter creates one UUIDv7 for each new intention, using Unix milliseconds from the binding discovery response (`sampled_at`) and elapsed time since that sample. Each retry sends the original envelope, including the account, player, universe, epoch, protocol, expected terms, and IDs where applicable. Keep the envelope across connection loss and process restarts. Rebinding to another player or epoch requires a new decision.

## Submission and lookup

PostgreSQL samples wall time during admission and again after writes that can block, before committing the transaction. For an RFC-variant UUIDv7 with timestamp T, the interval is **T − 30,000 ms ≤ server time < T + 900,000 ms**. Game time, the ordering frontier, and scheduled execution deadlines are independent.

| Operation | HTTP result | Client action |
| --- | --- | --- |
| Identical submission in the window | Original receipt or result | Follow that operation through completion. |
| Same identity with changed intent | 409 `Conflict` | Inspect the original operation. |
| Submission at or past the deadline | 409 `COMMAND_EXPIRED` | Refresh state. The original request may have succeeded. A new order requires a new decision. |
| Identity more than 30 seconds ahead | 400 `COMMAND_IN_FUTURE` | Resample server time. Keep the identity of an uncertain operation. |
| Unsupported UUID version or variant | 426 `COMMAND_ID_UNSUPPORTED` | Update the writer and reconcile outstanding orders. |
| Malformed command UUID | 400 `Malformed` | Correct the writer. |
| Authorized lookup of a retained receipt | 200, with pending or terminal status | An accepted command can finish after its submission deadline. |
| Authorized lookup finds no in-window receipt | 404 `NotFound` | Confirm binding and deadline before retrying the exact saved envelope. |
| Authorized lookup finds no receipt for an expired v7 | 410 `COMMAND_HISTORY_EXPIRED` | Reconcile against current state. The outcome is unknown. |

V2 and V3 accept one order per envelope. V4 foreground gameplay links a presence command to the gameplay command. For v7, XOR the final byte of the gameplay UUID with 1 to derive the presence UUID. Both share their timestamp and deadline. The transaction compares the hash of the entire pair and writes both halves together. The machine route derives the pair server-side. Standalone foreground presence has its own command identity. Social, alliance and empire-profile submissions have dedicated receipts and use the same time window. Command-result GETs apply to the gameplay ledger.

## Rolling upgrade

1. Keep cleanup disabled. Apply the server bridge and migration 0052 through the ordinary release process. Read the installation-wide UTC deadline with `SELECT to_timestamp(legacy_until_ms / 1000.0) FROM command_admission_cutover WHERE singleton`. The migration establishes it once, seven days after installation. Restarts and redeployments reuse that value.
2. Replace every serving API instance before depending on enforced expiry. Keep the preceding legacy writer binaries available during this mixed-server step. Existing accepted v4 input, pending work and receipts keep their original identities. Workers continue to settle the same durable rows.
3. Roll out the UUIDv7 browser and bot writers before the deadline. Verify real binding discovery, an in-window repeat, retained pending lookup, and recovery of a saved bot envelope. Old tabs can submit v4 during the transition. At the deadline, a new v4 submission gets the update-required response, even if it previously succeeded. Refreshing the client and reading retained receipts are safe.
4. Before enabling a future cleanup release, verify the shared cutoff has passed, all external admission writers enforce the window, and the oldest permitted rollback image also enforces it. Restoring a pre-bridge writer after pruning could execute a vanished identity again.

## Handoff to retention work

- Use the timestamp embedded in the external v7 identity plus 900,000 ms for its acceptance deadline. Add a positive operational safety margin for wall-clock adjustment, rollout and in-flight work. The 30,000 ms future allowance can move the deadline past admission time plus 15 minutes. Logical `at_ms` describes game ordering. For legacy rows the common v4 cutoff is the earliest time to consider removal.
- Keep pending commands for their entire lifetime. Remove paired rows and their link atomically only when both halves are terminal and every dependency allows deletion. Pre-bridge machine pairs can have a different presence derivation. Follow the stored link and derive its deadline from the external gameplay ID. A timestamp decoded from an older derived presence ID can be thousands of years ahead.
- Preserve parent commands until dependent cancellation and recall have resolved to durable entity/input identities. Honor every receipt referenced by a retained game update, or atomically retire the updates with a reconnect floor and snapshot reset.
- Keep the entire per-actor command-count window (60 seconds in game ordering time), including rejected and paired submissions counted by admission. Protect active claims, delayed completions and their acknowledgement grace. Scheduled events use durable internal identity and generation.
- Gate pruning on analytics reconciliation and report-source cutover. Keep undelivered and quarantined activity facts, and take responsibility for bounding delivered outbox rows. Measure backlog and validate cleanup races independently.

## Producer and fixture scope

The submission routes are V2/V3 `commands`, V4 `commands`, `presence` and `machine/commands`, the V4 social and alliance command routes, and empire-profile edits. The native game service reaches the same PostgreSQL admission and receipt checks. The retired V1 command API continues to require a protocol update. Discovery, view and quote correlation IDs, upload and emblem identities, account IDs, internal inputs and scheduled events keep their existing generators. Ship appearance actions, report sharing and metered bot observations use separate request-ID ledgers. Their retention requirements remain independent of gameplay receipt cleanup.

The process recovery, rolling migration, progression, fleet, speed, rules and machine acceptance drivers create command IDs from the clock in their disposable database. The pre-upgrade bot fixture intentionally uses v4 for its original writer. The runtime qualification driver uses the supplied simulation timestamp for external commands and separate IDs for its internal events. Existing older client fixtures continue to exercise the finite legacy bridge. The strict-window tests cover admission on both sides of the cutoff.
