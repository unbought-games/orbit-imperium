# Connection recovery investigation — Discord #126

Investigation date: 2026-11-05. Base: `e8a96d81` (current main when the
isolated worktree was created). Scope: game connection lifecycle and notification
semantics. Login redirects/enrollment (#120), mobile navigation (#130), and
production deployment timing (#122) remain separate work.

## Report and attribution

[Gh0stP1rate's report](https://discord.com/channels/1559681008532586586/1560363739818098738/1567745828959817873)
at 03:42:12 UTC described brief disconnection notices during WiFi/cellular changes,
report activity, and menu navigation. [Ethan's confirmation](https://discord.com/channels/1559681008532586586/1560363739818098738/1567746521699586082)
followed at 03:44:58 UTC. Neither report includes a request trace or exact times for
individual failures. These messages establish user-visible symptoms, not their
server-side cause.

## Primary findings

1. **Confirmed client classification defect:** `Coordinator.problem` set
   `connectionInterrupted` for almost every non-429 error, including a single
   failed quote, snapshot, presence submission, or receipt lookup. The banner
   additionally inferred disconnection from `stale`. A failed request does not
   establish loss of service. A transient overview 503 followed immediately by a
   valid snapshot reproduces this distinction deterministically.
2. **Confirmed client lifecycle defect:** hidden pages kept delivery timers and
   streams alive; resume would not replace a stream still marked running. A
   suspended reader could therefore prevent opening a replacement, while old
   overview failures could overwrite the foreground recovery state. Explicit
   pause, request-generation fences, and replacement stream identity fix this.
3. **Confirmed competing presentation defect:** connection transitions also
   emitted timed HUD captions. Those captions have their own lifetime, so a
   recovered shared banner did not establish that all connection text had
   cleared. The shared banner now owns connection announcements, including when
   portaled into the HUD. The HUD does not claim a secure connection while the
   snapshot is stale. Hostile-fleet alerts and gameplay captions remain intact.
4. **Confirmed client protocol defects:** malformed successful JSON was treated
   as a network error, and the SSE adapter discarded `Retry-After`. Malformed JSON
   now uses the unreadable-data path. SSE cooldowns survive focus and suspension;
   a throttled stream alone does not mislabel healthy snapshot service.
5. **Expected lifecycle:** a closed stream, hidden tab, or stale-but-usable
   snapshot is not itself a player-action failure. The stream already reconnected
   quietly before this patch. Actual user orders still retain uncertain outcomes
   and their original durable IDs; background recovery never resubmits them.
6. **Confirmed server/client classification defect:** an active OIDC rotation
   claim, or contention for its short claim transaction, returned generic
   `Unavailable`. Every authenticated API request revalidates the session, so
   ordinary concurrent navigation/presence/overview requests could receive 503
   during a healthy rotation. The existing PostgreSQL held-provider test
   reproduces this. The server now sends `SessionRefreshing` with a bounded
   Retry-After derived from the claim deadline (one second for claim-lock
   contention). The client treats it as coordination. A first action refused
   before admission is explicitly reported as not sent, never queued; an older
   uncertain action retains its identity. Expired/ambiguous claims still require
   sign-in; refresh tokens are never replayed or restored.
7. **Individual report attribution remains unproven:** the retained counters
   corroborate auth-read failures near the reports but do not identify which
   sessions or distinguish rotation claims from other read errors. No sustained
   service outage or new database defect was established. Physical network and
   OS suspension effects remain separate possible triggers.

## Production evidence and limits

Read-only retained diagnostics for **02:00–05:00 UTC on November 5** cover both
reports and surrounding time. No production restart, configuration change,
deployment, gameplay mutation, or new monitoring infrastructure was performed.

- 170 samples each of website, Accounts, Orbit, analytics, and retained-session
  browser checks: zero failures. Maximum Orbit check duration was 1,206 ms;
  maximum retained browser duration was 1,786 ms.
- 885 container status samples: none recorded a stopped container, OOM, or
  nonzero restart count. 36 retained authentication metric snapshots were present;
  there were no retained allowlisted unavailable/error log events in this window.
  However, same-exporter auth-read counters increased from 274 to 336
  unavailable results (+62), with +5 in the interval ending 03:42:18 and +4 in
  the interval ending 03:47:22 UTC. The counter includes live rotation claims
  and other store errors; it is not equivalent to 62 service outages. Read
  cancellation increased by 67 and read sign-in-required by 5. Provider and
  persistence unavailable counters did not increase. Bootstrap auth/game
  unavailable counters remained zero. These findings qualify the healthy
  sampled checks rather than being hidden by them.
- 178 one-minute production metric periods: application readiness minimum 1;
  blocked scopes maximum 0; due-work lag maximum 0.164 seconds; host memory
  maximum 50.46%.

These are sampled aggregate observations, not continuous per-request coverage.
They do not exclude brief failures between samples, isolated player failures, or
WiFi/carrier problems. The earlier 00:00–02:00 UTC comparison window also had no
failed checks; it is not substituted for the report window. Raw operational data
stays outside this public repository. No user identity, credential, or payload
was retrieved to correlate a player session.

## State and notification policy

The session store owns validated game facts, command attempts, browser
foreground/online observations, throttling deadlines, unreadable-contract state,
and the result of failed snapshot verification. UI selectors derive the notice.
Transport closure and data freshness do not independently mean service loss.

- Hide/offline cancels delivery timers and aborts the stream. Hidden tabs make no
  new delivery requests. Foreground resume opens a replacement stream and
  refreshes the snapshot; pre-suspension snapshot/quote callbacks are fenced.
- A failed ordinary request marks data stale and requests reconciliation. One
  failed snapshot gets one immediate independent read. Failure of that
  verification establishes inability to refresh. An explicit service refusal
  with Retry-After is also actionable immediately; it forbids an immediate probe. There is no notification debounce
  or arbitrary grace period. Once unavailability is established, subsequent polls
  do not repeat the extra verification read.
- A confirmed browser offline event is actionable immediately while visible. It
  says the browser is offline, not that the server is down. A brief handoff that
  produces only an isolated failed request can recover silently.
- A valid coherent snapshot clears service/unreadable-data notices. Stream open
  alone does not establish fresh game data or a confirmed order outcome.
- A failed player action remains visible after connectivity recovers until it is
  resolved, retried, or dismissed as allowed. Unsigned/unsent actions are not queued.
  Background presence avoids producing a player-action error while offline/hidden.
- 401/403 still revoke access and direct the player to sign in. Contract failures
  retain useful last-validated data and the reload action. Build mismatch retains
  the existing bounded update/reload policy. Neither is classified as a server outage.

## Evidence matrix

“Browser fixture” means real rendered React/browser behavior with controlled HTTP;
“unit” means deterministic state/transport tests. Neither proves physical mobile OS
suspension. “Real local” uses this worktree's Rust binary, PostgreSQL, built frontend,
and Chromium, with no HTTP fixtures.

| Scenario | Earlier observed/source behavior | Expected and verified behavior | Evidence |
|---|---|---|---|
| Healthy foreground and navigation | Background presence and read failures could label the entire session disconnected | Healthy reads remain quiet; gameplay errors remain local/actionable | Coordinator tests; browser recovery observer; real local navigation/login |
| One failed snapshot followed by success | Immediate global disconnect before recovery | No connection notice at any observed store/DOM transition | Unit plus desktop/mobile browser fixture |
| Background/screen-lock lifecycle | Timers/stream continue; old running stream blocks replacement | Pause delivery; replace stream on resume even if old reader never settled; fence old callbacks | Deterministic held-reader and held-snapshot tests; browser visibility event test |
| Physical iOS/Android app suspension or lock | Reported symptom; no device trace supplied | Same hidden/resume policy | **Not physically tested**; OS-specific event delivery remains an uncertainty |
| Brief network handoff, browser remains online | Failed request implies lost connection | Successful independent snapshot stays quiet | Controlled transport failure + recovery tests; physical WiFi/carrier handoff not reproduced |
| Explicit offline/online | No offline listener; internal presence could show action error | Immediate accurate offline notice; no unsent order queued; notice clears on fresh recovery | Unit, desktop/mobile browser fixture, real Chromium offline/online |
| Sustained unreachable service | Generic “Connection lost” | Last snapshot stays visible; verified inability to refresh is unmistakable; retries recover | Unit, fixture, real local SIGTERM/restart at both sizes |
| Stream close/reconnect/keepalive | PR329 reconciles on stream open | Preserve cursor; immediately reconcile; stream closure alone stays quiet | Delivery tests, real restart |
| Catch-up / pending revision | Coalesced minimum revision and repeated polling | Retain usable snapshot; do not infer an outage from freshness; keep receipt constraints | Existing minimum-revision, delivery, receipt tests; selector test |
| Same-build backend restart | Recovery exists, but failure classification is broad | Warning during confirmed interruption; valid snapshot clears it without reload | Real local desktop/mobile restart |
| New frontend build | PR329 announces update and limits automatic reload | Keep route, bounded reload, manual recovery on repeated mismatch | Existing desktop/mobile deployment browser cases rerun |
| Live token rotation | Generic 503 during an active claim | Typed coordination response and server retry deadline; refuse unadmitted actions visibly; keep older uncertainty | Held-provider PostgreSQL regression, HTTP contract, coordinator and browser tests |
| Authentication expiry | Access invalidated on 401/403 | Keep explicit sign-in path, no “server outage” or transport verification retry | Added coordinator 401/403 tests; existing session tests |
| Request throttling | PR227 uses countdown and explicit action retry | Preserve cooldown, uncertain identity, and no automatic resend | Existing coordinator/action tests; new SSE Retry-After tests |
| Malformed/incompatible data | Schema errors differentiated; JSON syntax errors were not | Preserve last valid state and explicit reload/report notice | HTTP JSON regression; coordinator schema test; desktop/mobile browser cases |
| Lost command acknowledgement | Durable uncertain attempt survives | Retry remains visible after healthy snapshot; no background resend; original ID retained | Coordinator/HTTP tests and desktop/mobile rename browser case |
| Banner inside HUD during outage and recovery | Separate timed caption can outlast banner | Same banner moves into HUD; recovery clears it; secure label only with fresh data | Desktop/mobile browser assertions and captures; caption regressions |

## Prior fixes reviewed

- **PR227** (`ff3673a6`): correctly separates throttling and command retry from
  outage handling. Its broad non-429 interruption classification and stale
  fallback remained. Cooldown, durable identity, and explicit resend behavior
  are preserved.
- **PR326** (`25d0db76`): bulk mark-read is now one atomic command, not 100
  sequential commands. That addresses a specific request burst; it cannot explain
  or fix hidden-tab streams, network handoff, or single-request classification.
- **PR329** (`a4b2dcab`): correctly handles build metadata, unreadable schema,
  and stream-open reconciliation. The report came after that announcement and
  has broader triggers. Those protections remain and their browser cases pass.

## Validation and reproducibility

Commands: `npm test`, `npm run lint`, `npm run format:check`, `npm run build`,
focused `npm run test:ui -- client-update.spec.ts --workers=1`, and the existing
shell disconnection scenario. Capture uses `ORBIT_TEST_SCREENSHOTS=1`; it remains
inactive in ordinary runs. Screenshots stay local and are displayed in the
implementation chat, never hosted or embedded in the PR description.

The local real-service experiment used `make dev-setup` in the isolated checkout,
then `npm exec -- node test-results/real-recovery.mjs`. The script owns one server
process and its browser, stops only that server with SIGTERM, checks the rendered
warning, restarts the same binary, and asserts zero document navigations plus
successful offline/online recovery. The disposable Compose project is
`orbit-dev-a91070ac060c`. Docker's default address pool was exhausted; an inspected,
non-overlapping `10.253.126.0/28` network override was used only for this project.
No other task's containers/networks were stopped or pruned.

Measured preparation and execution, initial failures, final revision, CI/review
results, and cleanup are recorded in the implementation chat and the test audit.
