# Rolling sessions

Orbit uses a 30-day inactivity window for both local and Accounts logins.
Opening/returning to a visible page or real pointer, keyboard or wheel input sends
`POST /api/v1/session/renew` with the session cookie, matching Origin and CSRF token.
The client throttles this to once per minute; there is no periodic activity timer.
Background updates, presence polling, bootstrap recovery and passive token refresh
do not extend the idle deadline. Renewal does not change password authentication
freshness or administrator assurance.

The server renews both its stored deadline and HttpOnly browser cookie. In OIDC
mode it first revalidates and commits any rotated tokens under the existing
per-session advisory lock. It then authenticates to Accounts'
`/api/auth/game-session/renew` endpoint using the latest stored refresh token and
configured confidential client credentials, reacquiring the same lock. Each phase
has its own ten-second budget. The second phase never rotates tokens, so a slow or
cancelled renewal cannot roll back an already completed token rotation. Only live local rows
can be extended. Logout and expiry win over a late response. Provider/network
outages return 503 without clearing the cookie; later activity retries. Revoked
or expired sessions return 401 and the UI returns to sign-in.

Deploy the companion Accounts change first. No schema migration is needed. A
still-live old eight-hour session adopts the new window on foreground renewal;
already-expired sessions need one sign-in. The shared Rust auth crate stays at
its current version. No production infrastructure setting changes are needed.

Accounts retains its separate host-only cookie longer than 30 days so it can
recognize a central session kept alive by a game; its database still enforces
30-day inactivity. Orbit cannot refresh that other-origin browser cookie. Clearing
cookies, browser eviction, explicit logout and security revocation can still
require sign-in earlier.
