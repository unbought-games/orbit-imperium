# Backend lane (in progress)

Branch `emick/ship-appearance-backend`, assigned checkout only.
Canonical package `orbit-light-fighter` / `concord-v1`, target `LightFighter`.
HTTP renderer seam matches IMPLEMENTATION.md; backend uses UUID request/artifact IDs.
The worker runs on API hosts (where catalog/assets/profile evidence are available),
with database leases and one bounded render per process. Worker-only roles do not
need renderer/catalog configuration. No bootstrap response additions.

Empire insignia migration copies selected recipe into empire-owned storage and
stops template mutation/deletion from changing other empires. Existing template
API remains usable; current appearance projects the empire copy.

Rust validation has not started. This file will record its start/completion so the
integrator can serialize expensive checks. Browser/build/typecheck remain pending
with integrator.

Renderer media access: actual insignia route is `/api/media/insignias/{symbol}/{sha256}.svg`.
API accepts `Authorization: Bearer $ORBIT_APPEARANCE_RENDER_TOKEN` on that route
only, for installed catalog originals. It grants no session or other API access.
Runtime should send this shared token only to the configured exact game origin;
set its origin token to the same credential. Minimum token length 32 bytes.
Renderer base URL is `ORBIT_APPEARANCE_RENDER_URL` (backend appends `/v1/render`).
Dyes guaranteed offline: free-ivory, free-graphite, free-steel, free-blue, free-red,
free-gold, free-green. Catalog dyes are additional named options.

Rust validation starting now: `cargo check -p orbit-server` (sole Rust validation
owner). Editor source is preserved by projecting this empire's authored recipe
onto the selected library entry; other reusable templates remain account scoped.
Deleted templates leave other empires' selected recipe/ID available as a saved
empire copy (revision zero can recreate the reusable template).

Compile check passed after sharing AccountProfiles' existing cache via Arc; no
second cache or duplicate entitlement source. Public artifact variants prefer
WebP, one URL per width; PNG remains retained in private artifact metadata.
OpenAPI ShipAppearanceState + action/request schemas added; generated contracts
updated using installed pinned openapi-typescript (checkout has no node_modules).

Schema review addressed: generic target text (installed package validation remains
LightFighter-only); latest input compared against immutable request snapshot, no
equipment render_input; account-owned artifacts and jobs survive membership deletion;
job provenance includes original player/epoch; older insignia writers are explicitly
rejected by a database writer guard. New writer sets a transaction-local flag.
API rollout must complete before allowing old editor writes; old readers work,
but rollback needs current compatible insignia writer or paused cosmetic writes.

Focused test binary compilation is running. DB execution will remain with the
integrator as requested; tests use normal Make discovery, no runner changes.

First DB run: ship supersession/lease test passed (2.999s), next identity test failed
in fixture setup (2.100s): fixed second-universe name collided with the previous
fixture under universe_names_unique. This is a new test-fixture defect, not a product
failure. History/repair ledger inspected (no prior test history). One repair: derive
fixture names from their UUIDs; audited the new migration fixture and fixed the same
constant-name pattern there. Two remaining tests were canceled by fail-fast.
Preparation compile: 12.62s; runner setup: 0.23s. Disposable DB cleaned by runner.

## Validation slot released

Current focused Rust/DB command completed successfully. **No Rust compilation or
expensive validation is running in this lane. Root owns the slot now.**
`make test-db DB_SUITES='ship_appearances ship_appearance_upgrade insignias' DB_JOBS=1`
passed: ship command/worker suite 4/4 (9.559s), migration upgrade 1/1 (0.795s),
existing insignias 1/1 (3.872s). Compile preparation 24.98s; per-suite runner startup
0.25/0.27/0.16s. Standard runner removed each disposable DB; root owns Compose.
The added dye-access expiry/restoration test and renderer adapter unit tests still
need execution after the frontend validation slot. Final server check also pending
since the renderer port/cancellation/backoff edits followed the earlier server check.
No browser, production build, or frontend full typecheck was run here.

Renderer is now an application-owned ShipRenderer port with render/cancel methods.
HTTP output validation is generic bounded dimensions/aspect consistency (not a
Concord-only dimension list). Worker observes cancellation/supersession during
HTTP work, drops its HTTP future, best-effort DELETEs provider work, then records
canceled. Running cancellation stays rendering/can_cancel=false until acknowledged.
429 uses durable not_before scheduling (1–60s clamp), preserving request identity.

Library response includes each account design's newest revision plus any older
revision currently pinned by this empire. This lets the Hangar start from the exact
pinned recipe even after another universe updates the account template. Save still
checks the account's latest revision and rejects stale writes. Other empires'
private equipment is not included.

Cheap schema verification while frontend owns validation slot: ShipAppearanceRequest
and ShipAppearanceState compile with the pinned AJV 2020 + format configuration.
Formatting complete. No Rust process is running.

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
