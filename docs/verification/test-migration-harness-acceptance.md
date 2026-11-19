# Shared browser fixtures and explicit acceptance

Stream 09 compares the frozen November 10 audit at `0c235fd6` with the implementation base `7449be126307cf788c2f47083922c73e70f582f4`. The independent journey review and the eight domain handoffs own the reasons for retaining individual application and component cases. This stream owns their shared network boundary and the explicit acceptance commands.

## Fixture contract for stream 10

- Application and production-homepage fixture runners set `ORBIT_UI_E2E=1`. The shared Playwright fixture installs the last-resort API handler on the default context and every additional context created during the case. A request that reaches it raises an error with method, path and operation. Playwright can then interrupt a case waiting for a different response. Login credentials, request bodies and query strings are excluded from the diagnostic.
- Model a deliberate refusal in the handler for the exact operation. Fulfill its intended error or abort its transport, then wait for the expected outcome and assert the rendered state. Fall through from unrelated operations. Normal negative responses do not trigger the last-resort handler.
- The gallery selects the component boundary in its fixture. Unexpected API requests and uncaught page exceptions fail the case. The mount still waits for the actual scenario marker. Only explicitly installed media and component-specific HTTP fixtures can satisfy those requests.
- Explicit full-system suites use the server boundary and get real announcements, session and gameplay traffic. The browser context wrapper records only contexts created during the case. Open contexts are available to failure capture, then teardown restores the worker's method and closes any remaining case-owned contexts.
- `withBootstrapResponse` subscribes before navigation and requires a completed GET to the exact bootstrap path and a successful status. The ready shell additionally waits for its Empire heading. Report, quote and deliberate-error helpers keep their operation-specific delivery boundaries. The application and component builds remain separate from production prerendering.
- Keep the existing make/npm entry points, environment flags, explicit-suite guards and required production homepage/package checks. There is no new selection interface. The production image smoke also requests the prerendered page from the running Rust server and fetches its emitted CSS and module assets.

## Acceptance inventory and current-main delta

The frozen inventory has 22 explicit browser identities and ten production-homepage identities. Five browser cases were retired by #451 before stream 09. Its [journal-independence verification](journal-independence.md) records their failed repair attempts, surviving protections and lost choreography. The original CSV and its case IDs remain authoritative for the November 10 snapshot.

| Boundary | Frozen identities and current disposition | Actual owner of the contract |
| --- | --- | --- |
| Core | All ten retained. `9ca848ce4736e34a` and `7f1637e2788d6ac8` now assert in-memory actions and durable work after reload under #445. | Real authenticated HTML, separate cookie jars, scheduler completion/cancel, malformed or wrong-principal response rejection, epoch rebinding, two-player delivery/recall and lost acknowledgement in six spec files. |
| MVP | `adaf48fad5f31557` retained. | Five private accounts in the browser, real registration and command delivery, original receipts and restart in the native driver. |
| Progression | Retain `4ca4c9c6ff8bbf72`, `2f176cdb3cc5d2f4`, `555175b89ad61913`. #451 retired `b9ed2a85f9d15f5d`, `ed09b1fe419f2109`, `fe8d794a476bf465`. | Native keyboard orders and browser history remain. HTTP/PG verifies terms, receipt privacy, idempotent paid work, crash cut points and exact output. The retired multi-viewport and offline tours remain historical gaps. |
| Missions | Retain `9609f52e7aca7993`. #451 retired `3b0bcca7721fff3d`. | Paginated inbox after abandoning a detail load. The script owns paired admission/retry, arrival, return, reports, debris, privacy and concurrent outcomes. |
| Raiding | Retain `c5e5be4e26e93d97`. #451 retired `7626374fbd9e8fce`. | Zero-debris report action in the real client. The script owns combat evidence, survivor/loot conservation, harvest, crash and replay. |
| Signup | `cf7544295f707deb` retained. | Production-mode binary, anonymous entry, registration transaction, unavailable first game view, cookie recovery, mobile first construction, logout and private relogin. |
| Recovery | Native script. | Real API/worker interruption before/after commit, exact receipts and balances, replicas and stream replay after process death. |
| Migrations | Native script. | Independently built normal and synthetic additive-upgrade binaries, old/new overlap, migration locking, killed migrator, retained identity/work, safe refusal and restart. The PostgreSQL migrations binary also exercises the actual historical prefix and removal in 0051. |
| Production container | Native smoke and opt-in isolation test. | Actual production binary and assets, CLI setup and complete migration ledger, no seeded accounts, registration, durable restart and two isolated Compose databases. |
| Rolling rules | Native script, distinct configuration-aware bridge and final binaries. | Compatible overlap, retained old terms, activation rollback, serial/scoped handover, isolated universes, actual browser refresh and restart. |
| Speed | Native script via `make test-explicit SUITE=speed-updates`. | Bound settings, old-rate accrual, paid deadlines and new quotes across speed change, recall and restart. Manual Make entry is available independently of workflow dispatch choices. |
| Bot compatibility | Native script via `make test-bots`, pre-S1 binary `22fd8bf4b597b213f7fe396c5969339e473372e2`. | Pre-upgrade accepted work, old-writer refusal, authorized accounting, private receipts, repeat identity, sleep/retirement and restart. Policy export includes the default visible display field. |
| Shipped homepage | All ten retained. | Open and closed raw HTML and CSS, JS on/off at 390 and 1440, links, keyboard, hydration and images against the production Vite output. The image smoke verifies the independent packaging and server boundary. |

The original 87 Make target declarations remain available. Current main added image-input validation, the moon-destruction runner, ship-customization live validation and request-metrics checks. Operator qualification and real-provider experiments use their own explicit prerequisites. Local resource coordination uses the existing Make/npm drivers and disposable Compose projects.

## Validation and review

Pending revision-bound results.

### Selection and review before the validation handoff

Pinned Node 24.18.0 and npm 11.16.0 installed 303 packages in three seconds. Native collection on `292a2fea` found 10 core, one MVP, three progression, one missions, one raiding, one signup and ten production-homepage cases. An initial homepage-only collection omitted the runner's `ORBIT_UI_E2E=1` flag and stopped at configuration. Repeating collection with the two flags supplied by `homepage-e2e.mjs` produced all ten. Collection exercises no browser case.

A dry selection of the old explicit debris wrapper found just one application case. The other named application files contributed zero matches, including the removed harvest report file. The wrapper now selects the live combat-to-dispatch deuterium case, four Galaxy deuterium cases, the mounted harvest grouping case and six deterministic files. Those six files passed 95 assertions in 1.08s. No CI job selection changed.

Two fresh, read-only `browser_test_reviewer` children ran with `fork_turns="none"` and the repository role. Both received the absolute checkout, exact Git objects, raw fixture and caller paths, Playwright/Vite and runner configuration, and the testing strategy and repair records.

| Packet | Verdict, reproduction and disposition |
| --- | --- |
| `7449be12..b9f0949e`, application/component fixtures and scripts | Changes required. DELETE logout previously matched the generic session route. Five retained mobile logout variants plus the mobile shell logout journey now receive a real fixture logout response with CSRF, anonymous subsequent bootstrap and a refused session read. Unknown request failures moved from teardown to the active Playwright route callback so a misspelled bootstrap cannot leave a delivery wait pending. The document HTML handler skips API paths. Unrelated startup, fleet popup and tutorial operations now fall through. Held Empire rename focus binds GET and the requested player's report-independent profile, subscribes before release and settles its gate on every path. |
| `b9f0949e..7adc7a12`, affected callers, complete baseline `7449be12` | Changes required. The reviewer invoked the route callbacks in memory. A wrong-player tutorial command committed, a PUT quote for a different universe returned terms, and an unknown profile source returned a player. The shared query/command handlers now verify the fixture binding, request or command identity, and operation before constructing results. Profile observations distinguish self, rankings and the prepared Galaxy system. Exact GET fixtures for hosted entry/config and homepage replace permissive page routes. Three Vitest cases invoke the installed handlers directly and passed in 0.716s on `57e1e049`. Core readiness, extra-context teardown, retained native fleet navigation, Empire-name loading focus and production image/asset separation passed source review. |

The original 31-test tooling run passed in 10.92s on `b9f0949e`. During the second review, an invocation under the host's Node 23 stopped before TypeScript collection. The pinned Node 24 run passed all 11 diagnostic/readiness assertions in 0.291s. A temporary narrow TypeScript config missed the router's history augmentation and Node types, and exposed an undefined progression-factory response argument. The helper now rejects a missing response explicitly. A second narrow check still lacked the history augmentation declared by the full project in `router.tsx`. The normal project checks own final type evidence. These are setup and authoring attempts, with no original browser case retired or repair history reset.
