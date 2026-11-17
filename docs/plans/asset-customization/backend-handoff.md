# Backend lane handoff

Branch `emick/ship-appearance-backend`; implementation commit `18f31e75`.
No PR, merge, deployment, browser suite, production web build or frontend full
typecheck was performed by this lane. Integrator owns the one final PR and acceptance.

## Delivered

- Migration 0048 copies each empire's current authored emblem into independent
  recipe/revision fields. Template edits/deletes no longer mutate other empires.
  All current display readers consume the empire copy; the existing editor's
  selected library entry projects the authored copy, including unavailable content
  and deleted-template copies. History is retained and new observations append,
  including multiple edits within the same millisecond.
- Immutable account ship-design revisions; independently pinned empire equipment;
  account-owned UUID artifacts retained across empire removal. The library returns
  latest revisions plus any older revision currently pinned by this empire.
- Authenticated/CSRF-bound POST ship-appearances with Load, Save, Equip, Reset,
  Cancel and Retry; exact canonical response and OpenAPI/generated contracts.
  Atomic save/equip intent, stale-revision conflicts, request replay protection,
  ownership and installed-target/dye validation. No bootstrap additions.
- Application-owned ShipRenderer port with render/cancel methods; bounded HTTP
  /v1/render adapter; durable per-empire/target latest pending request and active
  lease. Worker fencing checks lease, latest request, original player/epoch and
  current emblem revision. No DB transaction crosses HTTP or object writes.
- API-host processor, one render per process; restart/lease recovery, live emblem
  and access-fallback refresh, bounded 429 backoff, recoverable renderer absence.
  Canceling active work remains rendering/can_cancel=false until the worker drops
  its HTTP future and best-effort cancels provider work. Queued cancellation is
  immediate. Running superseded work can never activate.
- Renderer output is bounded by body/variant/byte/dimension/decoded-allocation
  limits with actual image validation, alpha, MIME and aspect consistency. Backend
  writes UUID objects through AssetStore before ready. Public artwork returns one
  preferred WebP URL per width; PNG variants remain retained in artifact metadata.
  Delivery requires the owning account and uses private immutable caching.

## Integration seams

Canonical package `orbit-light-fighter` / `concord-v1`, target `LightFighter`.
Backend URL setting `ORBIT_APPEARANCE_RENDER_URL` is a base URL; adapter appends
`/v1/render`. `ORBIT_APPEARANCE_RENDER_TOKEN` is a shared 32+ character secret.
Use its value for runtime `ORBIT_SHIP_RENDERER_TOKEN` and `ORBIT_SHIP_ASSET_TOKEN`.
Restricted originals accept that bearer only on
`/api/media/insignias/{symbol}/{sha256}.svg`, restricted to installed catalog IDs.
It provides no game identity or command access. Runtime must attach it only to
its configured exact game origin. No browser session is forwarded.

Free dye IDs: free-ivory, free-graphite, free-steel, free-blue, free-red, free-gold,
free-green. Installed catalog dyes are additional named options. Expired/missing
access preserves authored choices and derives free fallback inputs; resolved
access snapshots expire before command admission. AccountProfiles clones share
its existing cache, preserving one source of entitlement evidence.

API hosts own the processor because they have assets/catalog/profile evidence;
worker-only roles need no new configuration. S3 needs the additional
`ship-appearances/*` prefix. Migration guards reject old insignia writers; remove
old binaries from identity-serving traffic after migration. Wire response shapes
remain compatible. Rollback requires a compatible writer or paused cosmetic writes.
See `docs/operations/empire-customization.md` for operator details.

## Verification

Tested implementation revision: `18f31e759eaca3fdfc6e82a344488386c0909a88`.
No production source changes followed that commit; handoff edits are documentation.

- `make test-db DB_SUITES='ship_appearances ship_appearance_upgrade insignias' DB_JOBS=1`
  passed: 5 ship tests (11.477s), migration upgrade (0.762s), existing insignias
  (3.700s). Compile preparation 9.27s; runner setup 0.24/0.16/0.14s. Covers auth,
  replay, namespace isolation, immutable pinning, A/B/C supersession, cancellation,
  durable busy deferral, lease restart/fencing, emblem/editor isolation, history,
  dye-access fallback/restoration, artifact privacy and retention.
- `cargo test -p orbit-transport-http --lib ship_renderer::tests`: 2 passed,
  compile 28.41s, execution 0.01s. Actual PNG validation, generic aspect ratio,
  forged metadata rejection and HTTP 429/Retry-After clamp.
- `cargo clippy -p orbit-application -p orbit-storage-postgres -p orbit-transport-http
  -p orbit-server --lib --bins --features orbit-server/test-support -- -D warnings`:
  passed in 17.00s; includes final server compilation.
- `cargo fmt --all`, `git diff --check`, pinned AJV compilation of both new endpoint
  schemas passed. Generated contracts used installed openapi-typescript 7.10.1;
  this checkout has no node_modules, so `npm run contracts` initially failed with
  missing executable, then the same pinned installed executable succeeded.

Failure record: first DB run passed the worker test, then failed identity fixture
setup on duplicate fixed universe name (2.100s). History/repair ledger checked; no
prior test history. Its one repair uses UUID-derived names; the same new migration
fixture pattern was audited/fixed. Two tests were canceled by fail-fast. Subsequent
focused runs passed. Initial server compilation required sharing AccountProfiles
via Arc; later generic renderer editing needed an explicit tuple type annotation.
Neither was a test assertion defect. No unchanged retry was used.

Each disposable DB was removed by the standard runner; temporary test assets and
HTTP fixtures were cleaned up. Root owns the provided Compose project's lifecycle.
Queue/merge timing is not applicable. Initial setup/compile caches were cold.

Pending integration proof belongs to root: actual Node renderer publication and
server restart via the recipe below, final integrated schema/tooling checks and
owner UX acceptance. Root has separately reported browser/type/build acceptance
and real renderer POST; this lane does not claim those as its own verification.
A crash during object publication can leave unreferenced immutable bytes; they are
never served without an authorized artifact record. Storage garbage collection
was not added in this slice.

## Real local persistence acceptance recipe

Use the task Compose resource already owned by root, not another Docker project:

```sh
export COMPOSE_PROJECT_NAME=orbit-ship-slice-e1ab
export COMPOSE_FILE=/Users/ethan/.codex/worktrees/e1ab/orbit-imperium/compose.yaml:/Users/ethan/.codex/worktrees/e1ab/orbit-imperium/test-results/ship-customization/compose-network.json
export ORBIT_TEST_DB_PORT=55079
```

For HTTP acceptance create a unique disposable DB with `docker compose exec -T db
createdb -U orbit <name>`, then use `DATABASE_URL=postgres://orbit:orbit@127.0.0.1:55079/<name>`.
Build the test-support binary using the normal root validation slot; initialize with
`target/debug/orbit world scenario load playground` (local login user/password).
The existing `scripts/insignias-live.mjs` contains the proven exact scenario/server
setup if an executable reference is useful. Do not run that browser script merely
to set up this feature.

API environment: ORBIT_AUTH_MODE=local, ORBIT_COSMETIC_ACCESS=unrestricted,
ORBIT_ASSET_STORE=files, ORBIT_ASSET_DIRECTORY=<unique persistent temp directory>,
ORBIT_BIND=127.0.0.1:<api-port>, ORBIT_ORIGIN=http://localhost:<api-port>,
ORBIT_ALLOW_INSECURE_HTTP=1, ORBIT_ASSETS=<integrated web dist>,
ORBIT_APPEARANCE_RENDER_URL=http://127.0.0.1:<renderer-port>,
ORBIT_APPEARANCE_RENDER_TOKEN=<random shared 32+ character token>.
Start `target/debug/orbit serve`.

From integrated checkout run `node tools/ship-appearance/build.mjs`, then
`node tools/ship-appearance/server.mjs` with ORBIT_SHIP_RENDERER_TOKEN and
ORBIT_SHIP_ASSET_TOKEN matching the backend token,
ORBIT_SHIP_ASSET_ORIGIN=http://localhost:<api-port>,
ORBIT_SHIP_ASSET_ALLOW_PRIVATE=true, ORBIT_SHIP_RENDERER_PORT=<renderer-port>.
Installed bundled emblems work locally; a separate public fixture catalog tests
trusted HTTP fetch of an installed restricted original without browser cookies.

1. POST `/api/v1/session`, Origin matching API origin, JSON
   `{name:"user",password:"password"}`. Retain Set-Cookie and response `csrf`.
2. GET `/api/v4/universes/<session.memberships[0].universe>/binding?request_id=<uuid>`
   with that cookie; retain response `binding`.
3. POST `/api/v1/universes/<binding.universe>/ship-appearances`, cookie, Origin,
   X-CSRF-Token and `{context:{binding,request_id:<uuid>},action:{type:"Load"}}`.
4. Save with a new UUID design ID and request ID, design revision 0, target
   LightFighter, recipe version 1, skin_id orbit-light-fighter,
   package_revision concord-v1, primary free-ivory, accent free-blue,
   emblem `{treatment:"full",placement:"paired"}`; equip=true and current
   equipment revision. Replay the identical envelope to verify no duplicate jobs.
5. Poll Load to ready; fetch each artwork URL with the cookie and verify actual
   transparent image dimensions. Anonymous/other-account fetch must fail. Inspect
   `ship_design_revisions`, `empire_ship_equipment`, `ship_render_requests` and
   `ship_artifacts` in the disposable DB; no readiness precedes byte publication.
6. Restart only the task API, reuse DB/assets, Load again and verify design revision,
   pinned equipment and artwork survive. Change the emblem through the real
   insignias endpoint and observe a new render without saving the ship.
7. Stop only task-owned processes and `dropdb -U orbit --force <name>` via task
   Compose. Remove only that task's unique asset directory. Root owns Compose cleanup.

The deterministic DB tests already cover authorization, replay, A/B/C, lease
recovery, cancellation, busy deferral, namespace isolation, empire deletion,
migration history and previous-artwork preservation. This recipe proves the actual
Node renderer integration and process restart; DB tests do not claim that proof.

## Complete — validation slot released to root

`cargo build -p orbit-server --features test-support --bin orbit` passed in 44.77s.
Reusable executable:
`/Users/ethan/.codex/worktrees/ship-appearance-backend/orbit-imperium/target/debug/orbit`.
If root needs another build, reuse
`CARGO_TARGET_DIR=/Users/ethan/.codex/worktrees/ship-appearance-backend/orbit-imperium/target`
after cherry-picking the backend implementation. No Rust command, test HTTP server,
or task API is running in this lane. Root may resume all integrated validation.
