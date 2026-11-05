# Empire identity PR follow-through

PR: #353. Initial head: `ecd34d299c8a03cd842c9c2e4666dc6f232d09f9`.
Initial CI run: `42094839462`. All three database groups and build/lint/unit checks
passed. Six browser shards passed; shards 3 and 5 each reported one failure.
No queue entry had been created and no queue removal occurred.

## Validated review finding

The title hook passed an unbounded membership deadline to a browser timer. An
expiry more than 2,147,483,647 milliseconds away could overflow the timer, fire
immediately, and never wake the idle view at the real deadline. `atDeadline` now
uses bounded intervals and rechecks wall time until the deadline. Cleanup cancels
the current interval. Deterministic clock tests cover a sixty-day deadline,
cancellation after rescheduling, backward clock changes and elapsed deadlines.

## CI failures and retained coverage

Repository history, `empire-identity.md`, and the available verification/repair
records were inspected before changing tests. No standalone Test Czar ledger was
available.

- Shard 5: the desktop identity-editor case matched both the newly saved H1 and
  still-mounted preview H2 after its HTTP response completed. The initial test had
  already used its repair for the native disabled-option assertion. Accordingly,
  the 1440px variant was removed outright, without renaming or replacing it.
  The independently passing mobile variant retains the form wiring, focus,
  submission, conflict and unavailable-selection coverage. Its shared assertion
  now waits for editor closure and explicitly selects the H1. Both backend HTTP/
  database validation and the separate desktop typography/dossier cases remain.
- Shard 3: the mobile foreground-recovery case received a previously issued 503
  after the fixture had switched to success. This pre-existing test did not drain
  previous requests before changing response policy. Its first repair tracks the
  matching requests through complete response delivery before each phase change.
  The same pattern was audited in the session-rotation case and fixed there too.
  Those are the only mutable outage-to-success flags in this fixture file. The
  intentional failure assertions, response validation and recovery assertions are
  unchanged; no sleeps, retries or timeouts were added. Coordinator/delivery unit
  cases retain deterministic recovery and request-coalescing coverage.

## Focused verification

- Deadline/title unit checks: 7 passed in 0.161s.
- Both viewport variants of foreground recovery and session rotation, plus the
  retained mobile identity editor: 5 passed, 9.2s browser execution and 1.809s
  module preparation.
- Formatting, lint, generated contract checks, TypeScript and boundaries are
  checked before the repair push. The full new-head CI run remains authoritative.

This repair changes expiry scheduling and tests, not layout. Existing inspected
screenshots still represent the rendered UI. Remote CI logs, local repair logs,
and the original failures are retained with local verification artifacts.
