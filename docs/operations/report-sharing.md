# Report sharing

Players can explicitly publish combat, contact-lost, and espionage reports from
report details. Opening the controls does not publish anything. A new unlisted
link hides player/planet names and target coordinates by default; either can be
included before creation. Everyone possessing the link can read it without an
account or universe membership. Do not treat unlisted links as confidential once
forwarded. The UI explains that saved copies cannot be recalled.

`POST /api/v4/universes/{universe}/reports/{report}/share` accepts a binding
context and `Status`, `Create { options }`, or `Revoke`. Management requires the
current account's recipient binding, same-origin request, and CSRF token. Each
recipient has an independent random link. Repeated creation returns the existing
link and disclosure options; changing options requires revocation and a new link.
Deletion revokes sharing permanently, including after restoring a report.

`GET /api/v4/shared-reports/{token}` reads only the publishing recipient's stored
observation. A recursive allowlist removes internal fields, substitutes local
participant identifiers, drops return timings, and preserves unknown espionage
sections. Contact-lost reports cannot reveal the defender's outcome. Resource
quantities and counts remain exact decimal strings. Names are recorded at
publication; body names, observations, and the report ID remain historical.
Publication records store disclosure choices and historical names, not a second
copy of the report payload. Unknown report kinds are not publishable.

The standalone `/reports/shared/{token}` page reuses report rendering without
bootstrapping a session, loading live profiles, or starting analytics. API and
HTML responses are not cached; public pages discourage indexing and do not send
referrers. Invalid, revoked, deleted, or obsolete-universe links are unavailable.
The migration adds `mission_report_shares`; there is no production deployment in
this change.

Validation: application projection tests, HTTP authentication/CSRF and public
HTML tests, `make _db-report_sharing` with a disposable database, and the fixture
browser suite `npm run test:ui -- report-sharing.spec.ts`.
