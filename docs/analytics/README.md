# Optional first-party journey analytics

No analytics initializes unless `ANALYTICS_CONFIG` is present and explicitly
`enabled`. The existing game history remains authoritative for meaningful play.
Page views, controls and form submissions are browser observations only.

```json
{"enabled":true,"endpoint":"https://analytics.example","propertyId":"22222222-2222-4222-8222-222222222222","publicToken":"issued-public-ingestion-token","policyVersion":2,"environment":"production","handoffOrigins":{"https://accounts.example":"11111111-1111-4111-8111-111111111111"}}
```

Supply the JSON and a separate `ANALYTICS_SERVER_TOKEN` to API and worker roles.
The credential needs `ingest:server` and `identity:manage` on this property only.
The public config endpoint never returns it. The collector uses HTTPS (loopback
HTTP is available for tests), bounded response bodies, two-second requests and
20-event leased delivery batches. Source snapshots remain in PostgreSQL during
outages. Capture is capped at 200 journal facts per account/day; exceeding it
fails optional analytics, never authentication or a game command.

Register SDK browser schemas plus authoritative `account_authenticated` (custom,
no properties) and `universe_enrolled` (enrollment, required string fields
`target_namespace`, `target_id`, `world`, each max length 128), all version 1.
Namespaces are `oidc_` plus full lowercase SHA-256 of the verified OIDC issuer;
subjects come from revalidated identity. This matches the Accounts producer even
when Orbit's account/player UUIDs differ. Enrollment captures original
`joined_at_ms` and maps `orbit_player` IDs with relationship `player` and universe
scope. Legacy NULL join times remain unavailable. The reporting source can still
map those players; no invented enrollment timestamp is emitted.

The same-origin `/api/analytics` bridge can redeem an anonymous landing capability,
which transfers campaign evidence only. Identification also requires the game's
session CSRF token. It snapshots verified source records and journey, persists
stable event IDs and then attempts delivery/proof. A background task retries;
permanent rejections remain quarantined. Browser abandonment before snapshot
capture can lose the browser association; native enrollment/activity remain in the
game. `analytics_delivery_coverage` and `analytics_coverage_gaps` expose delivery
state and unacknowledged visit snapshots pruned after 90 days. Enrollment snapshots
remain while their source account exists. Deleting a source account cascades local
snapshots; engine subject deletion is a separate authorized operation.

Website-to-game references travel in URL fragments and are removed before SDK
initialization. `/api/auth/login-journey` preserves the ordinary OIDC state/PKCE
flow and adds the Accounts handoff to the authorization URL fragment. It never
accepts an arbitrary destination. Analytics failure falls back to ordinary login.
Modified/new-tab/download links keep native behavior; their cross-property
attribution may be unavailable. Invalid/expired capability transfers remain unknown.

Dynamic world/body/report route segments are redacted. Stable names distinguish
navigation, enrollment, upgrades, production and transport controls without names,
coordinates, resources, form values or report contents. GPC/DNT are honored.
Operator settings can call `window.orbitAnalytics.disable(true)` (or `false` to
resume); logout/account changes clear old identifiers. No banner or disclosure
text is added. Self-hosted installations choose their own configuration.

Validation: `npm run build`, `npm test`, `npm run lint`, and
`TEST_DATABASE_URL=<disposable> cargo test -p orbit-storage-postgres --features test-support --test analytics`.
The browser dependency is an MIT-licensed packed SDK under `vendor/`, pinned by
lockfile integrity, with no dependency on a sibling checkout at build time.
