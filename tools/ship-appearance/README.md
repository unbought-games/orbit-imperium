# Internal ship renderer

This is a separate deployable Node service. The API owns durable jobs, ownership,
authorization, exact immutable input snapshots, UUID artifacts, output publication,
and stale-completion fencing. The renderer owns no player data or output cache.
Every call executes independently, including identical inputs from different accounts.

Use the repository-pinned Node/npm and dependencies:

```sh
npm ci
node tools/ship-appearance/compile.mjs
node tools/ship-appearance/build.mjs
node node_modules/playwright/cli.js install chromium
node tools/ship-appearance/server.mjs
```

`compile.mjs` is an offline authoring step, not runtime startup. Committed maps are
rebuilt from the accepted, hash-verified source using sharp; it does not launch a
browser. `build.mjs` bundles the actual game insignia component and CSS for a tiny
private Chromium page. A production build/full game server is unnecessary.

Configure `ORBIT_SHIP_RENDERER_TOKEN` to a random secret of 32–512 characters.
Default listen address: `127.0.0.1:52941`; configure
`ORBIT_SHIP_RENDERER_HOST` / `ORBIT_SHIP_RENDERER_PORT` for an internal service.
There are no CORS headers or browser credentials. Do not expose the service as a
player-facing endpoint. Secrets are not embedded in browser assets or logged.

Build the isolated image from the repository root:

```sh
docker build -f tools/ship-appearance/Dockerfile -t orbit-ship-renderer .
```

The image uses Node 24.18.0, the lockfile's Playwright 1.56.1 and its pinned Chromium
revision. It contains public originals only and runs as the non-root node user.
No infrastructure changes or deployment are performed by these commands.

## Version 1 protocol

`POST /v1/render`, `Authorization: Bearer <token>`, `Content-Type: application/json`:

```json
{
  "version": 1,
  "request_id": "11111111-1111-4111-8111-111111111111",
  "package_id": "orbit-light-fighter",
  "package_revision": "concord-v1",
  "colors": { "primary": "#1e2e40", "accent": "#cf9c48" },
  "emblem": null
}
```

Or emblem `{recipe, appearance, treatment, placement}`: original immutable recipe,
server-resolved real `InsigniaAppearance`, `none|full|layers`, `near-wing|paired`.
Named dye IDs remain recipe evidence; renderer consumes authorized resolved colors.
No palette-only switch, sample emblem, supplied pixels or arbitrary URLs.

Successful response:
`{version:1, request_id, renderer_version:"finish-decal-v1", variants:[{width,height,mime_type,data_base64}]}`.
Eight variants: 1536×1024, 768×512, 384×256, 192×128, each PNG and lossless WebP,
with transparent alpha. Input max 32 KiB; insignia original max 64 KiB; at most four
layers; package dimensions max 2048²; total encoded image bytes max 24 MiB (base64
adds one third). Variants are fixed by the installed package/service, not callers.

`GET /healthz` returns protocol/renderer versions, readiness and capabilities
`{cancel:true,retry:true,max_concurrent:1}`. It does not render or mutate data.
`DELETE /v1/render/:request_id` with the same bearer cancels active work (202),
or reports absent/completed work (404). Client disconnect aborts the browser context
and pixel worker. Cancellation is best effort; the API must still fence late results.

Only one active render is accepted. Busy requests return 429 / `Retry-After: 1`;
invalid requests 400, oversized requests 413, missing auth 401, invalid media type
415, cancellation 409 and recoverable asset/browser/render failure 503. Browser
crashes cause the active request to fail; the next call relaunches Chromium. After
process recovery the backend resubmits its immutable snapshot. There is no durable
provider job or implicit retry, and no cross-account bake deduplication. Renderer
preparation has a 90-second functional deadline to release a stuck worker.

The single call includes texture preparation, paint and variant encoding. The
backend may expose `rendering` until the call completes and `preparing` while it
publishes/validates returned bytes. This protocol does not stream progress events.

## Installed package registry

`ORBIT_SHIP_PACKAGES` is a data-only JSON allowlist of `{id,revision}` objects;
it defaults to `[{"id":"orbit-light-fighter","revision":"concord-v1"}]`.
Install additional approved packages beneath `ORBIT_SHIP_PACKAGE_DIRECTORY`
(default: bundled public `art/ship-skins` directory), preserving
`<id>/<revision>/manifest.json`. No service/math changes are required. Startup
accepts one to 32 listed revisions (enough for all 14 ships plus rolling revisions),
with a 16 KiB registry and existing per-package byte/dimension limits. It pins each
validated manifest and sequentially checks every map's byte count, SHA-256, PNG
header/encoding and native dimensions before readiness. It retains only manifests,
not all decoded hull maps; there is no aggregate pixel limit on the collection.

Full bounded PNG decompression happens lazily for the selected request. Each map
is reread and rehashed against the startup manifest snapshot, so altered files
cannot silently redefine an installed revision. Missing/hash-corrupt/header-invalid
maps fail startup; a hash-consistent but malformed compressed payload fails the
render before publication. Replacing a manifest requires restarting the renderer.
No decoded package cache is retained between requests; the service's one active
render owns at most one package's five decoded maps (80 MiB maximum at 2048²),
plus bounded PNG decode intermediates, output work and worker-transfer copies.

Unlisted files are never discoverable by a request; callers supply only IDs and
revisions, never filesystem paths. Install originals read-only. Startup integrity
checks do not make later storage changes safe; runtime checks detect them.

## Installed and trusted insignia originals

Exact media path: `/api/media/insignias/<id>/<sha256>.svg`. Bundled free originals
are resolved directly from installed files. Optional `ORBIT_SHIP_ASSET_DIRECTORY`
is the root of an installed game asset store; files are read only at
`insignias/v1/<id>/<sha256>.svg`. Mount separately installed originals read-only;
never COPY them into public Docker context, source or fixtures.

Alternatively configure one exact `ORBIT_SHIP_ASSET_ORIGIN` (e.g. the internal
game media service), and optional dedicated `ORBIT_SHIP_ASSET_TOKEN`. The renderer
sends that bearer only to that configured origin and exact immutable media path;
it never accepts or forwards an end-user cookie. The integrated game media adapter accepts the backend's `ORBIT_APPEARANCE_RENDER_TOKEN`
on this media route only. Set `ORBIT_SHIP_RENDERER_TOKEN` and
`ORBIT_SHIP_ASSET_TOKEN` to that same backend token for the local first slice.
The service does not forward this credential to any other origin or path.

Redirects, userinfo, query strings, fragments, escaped traversal, arbitrary paths
and unexpected origins are rejected. DNS addresses are resolved and pinned for
each request; private/reserved targets are rejected by default. To deliberately
use a configured internal game service set `ORBIT_SHIP_ASSET_ALLOW_PRIVATE=true`;
this also permits HTTP on that one configured origin. Returned bytes remain size,
hash and static-SVG checked. Chromium receives embedded data assets only, and its
network routing/CSP prevents external requests. No remote asset data is logged.

## Local one-request command

With the service running, save a request JSON and run:

```sh
node tools/ship-appearance/cli.mjs request.json /tmp/ship-render
```

The command uses the same bearer and optional `ORBIT_SHIP_RENDERER_URL`; it writes
size-named PNG/WebP files. It does not save/equip a player design or publish artwork.

Focused tests: `node --test tools/ship-appearance/*.test.mjs`. These test deterministic
pixels, package loading, validation, asset restrictions and injected HTTP lifecycle;
they never launch Chromium. The integration owner separately verifies the worker
bundle, real game composition, screenshots, actual HTTP image output and container.
