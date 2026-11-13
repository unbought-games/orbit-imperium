# Server acquisition verification

Implemented on base c39cb5df with the changes in this commit. The SDK is packaged
from analytics c1ce8a2 (0.1.2), with its matching source offer in vendor/.

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

CI/review follow-up: switched the collection epoch to the existing HTTP-compatible
command ID helper, restored case-insensitive public directory matching, and added
the required news frontmatter. The original tests were retained; targeted checks
passed. Configured first-party origins no longer create referral campaigns.
The HTTPS cookie-deletion finding was reproduced as a non-failure in Chromium
156.0.8078.4: a Secure HttpOnly cookie was removed by a same-origin HTTPS expiry
response without a Secure attribute (one cookie before, zero after). No workaround
was added for that claim. SDK URL edge-case fixes are included in the refreshed
source archive and checksum-pinned tarball.

The explicit direct-entry probe also checks that readiness/JSON responses do not
seed a browser acquisition cookie. Middleware now issues that cookie only for
rendered documents and successful auth operations. Auth starts detach a prior
bound account's source, while fresh anonymous landing evidence remains eligible.
