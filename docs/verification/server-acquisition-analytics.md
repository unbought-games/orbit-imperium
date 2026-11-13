# Server acquisition verification

Implemented on base c39cb5df with the changes in this commit. The SDK is packaged
from analytics 32726c3 (0.1.2), with its matching source offer in vendor/.

- Focused client routing/invitation/optional-service tests: 13 passed (0.514 s).
- Native route/source/cookie tests: 3 passed. Includes named aggregation, exact
  unknown paths, clean invitation source, explicit campaigns, tampering, expiry
  and collection-choice boundaries.
- Disposable PostgreSQL analytics tests: 2 passed (1.39 s), proving server-only
  authentication/enrollment capture, repeated enrollment idempotency and no
  capture without allowed request context.
- Web build and application typecheck: passed; native build/check: passed.
- Workspace Clippy with the required orbit-server/test-support feature: passed.
  An initial invocation omitted that feature and hit existing test-support imports;
  it also identified collapsible-if/style findings in the new middleware, fixed
  before the successful canonical check. No assertions were removed or weakened.
- Real three-service HTTP acceptance: clean invitation path -> OAuth -> Accounts
  registration -> Orbit membership -> real collector acquisition/player link.
  No JavaScript executed and no browser analytics requests were made. Exactly one
  signup, one enrollment after two attempts, password method, invitation source
  and named route were verified. No invite code appeared in collector payloads.
  The fixture exercises acquisition plumbing; invitation reward eligibility is
  covered by the existing community/invitation suites, not this analytics probe.

The real-service fixture uses isolated synthetic databases and loopback services.
Initial setup attempts exposed a missing fixture universe and the intentional
production HTTPS-origin requirement; setup was completed and the local Accounts
server used its development HTTP mode. Product protections were not relaxed.
The published Accounts acceptance script reproduces the HTTP/collector assertions
against such a fixture. Builds and targeted checks were serialized; complete phase
and runner-wait timings were not recorded. There are no UI presentation changes.
No production access or deployment was performed.
