# Runtime lane handoff

Implemented on `emick/ship-appearance-runtime`, based on `3ac1a649`. No shared
package.json/Makefile changes, browser runs, production builds, full typechecks,
PR, merge, deployment, or changes to another checkout.

## Browser seam

Import `ShipAppearancePreview` from `packages/ship-appearance/browser` using the
relative repository path (no package installation/workspace configuration needed).

```tsx
<ShipAppearancePreview
  skin={skin} // canonical ShipSkin
  colors={{ primary: '#1e2e40', accent: '#cf9c48' }} // authorized resolved hex
  emblem={state.emblem} // real InsigniaAppearance | null
  treatment="layers" // none | full | layers
  placement="paired" // near-wing | paired
  className="..."
  alt="Your Light Fighter"
  onError={(message) => {
    /* optional */
  }}
/>
```

The preview uses `skin.preview_url` within the installed package namespace. It
starts at 3:2 then adopts loaded dimensions, preserves old rendered pixels while
preparing changes, and fences stale async completions. It renders the actual
resolved inputs; there is no sample emblem or precomputed palette switch. Paint
math is shared with Node. The actual EmpireInsignia component/CSS renders emblem
shapes, all layers, named dyes, and static finish/effect overlays. Static policy:
existing reduced-motion appearance, frozen background position, inactive pointer/
focus, no animation, badge shadow or 3D transform. Layers removes background and
border only. Unsupported treatment patterns fail rather than disappearing.

Package URL: `/art/ship-skins/orbit-light-fighter/concord-v1/manifest.json`.
Preview URL: `/art/ship-skins/orbit-light-fighter/concord-v1/preview.webp`.
Manifest SHA-256:
`0a1bf08ccc453742868e9e4512a54bca1edd6e7a750629d9c4dcf73018fd3646`.

## Service seam

POST `/v1/render`, bearer `ORBIT_SHIP_RENDERER_TOKEN`. The request matches
IMPLEMENTATION.md exactly: version 1; UUID request_id; package_id and
package_revision; resolved primary/accent hex colors; emblem null or
`{recipe, appearance, treatment, placement}`. Recipe accepts literal and `dye:<id>`
colors; named dyes require authoritative resolved appearance rendering/layer colors.
No caller URL for skin packages, shader, image bytes or output-size controls.

Response: `{version:1,request_id,renderer_version:"finish-decal-v1",variants}`,
where each variant is `{width,height,mime_type,data_base64}`. Current package
outputs 1536×1024, 768×512, 384×256, 192×128 in both PNG and lossless WebP, preserving
transparent alpha. Limits: 32 KiB request, 64 KiB original SVG, four layers,
2048² native package bounds, 24 MiB total image bytes before base64 overhead.

GET `/healthz` exposes readiness/version and
`{cancel:true,retry:true,max_concurrent:1}`. Authenticated DELETE
`/v1/render/:request_id` cancels active work (202; absent/completed 404).
Disconnect aborts browser context/pixel worker. The backend still fences all late
completions. One active render; busy returns 429 / Retry-After 1. Cancellation is
409, recoverable rendering failure 503. Browser crash fails that call; the next
call relaunches Chromium. Backend resubmits exact snapshots after restart. There
is no provider job persistence, global output cache or cross-account bake dedup.

Texture preparation/paint/encoding happen inside the POST. The backend can show
`rendering` through this call, then `preparing` during output validation/storage
publication. There are no streamed progress callbacks. Rendering has a 90-second
functional preparation/recovery deadline; tests have no execution deadline.

## Installed package and asset configuration

`ORBIT_SHIP_PACKAGES` is an explicit JSON array of `{id,revision}`; default is the
single Light Fighter revision. `ORBIT_SHIP_PACKAGE_DIRECTORY` optionally points
at a trusted package root. It supports one to eight installed revisions and a
combined 8,388,608 native-pixel budget. Unlisted packages and caller paths fail.
The machine-readable v1 schema is `packages/ship-appearance/manifest.schema.json`;
geometry and map integrity receive additional pure validation. New valid packages
install through this data-only registry without service/math changes.

Actual emblem media path: `/api/media/insignias/{id}/{sha256}.svg`. Bundled public
originals resolve locally. For separately installed originals use a read-only
`ORBIT_SHIP_ASSET_DIRECTORY` asset-store mount, or one exact
`ORBIT_SHIP_ASSET_ORIGIN` and dedicated `ORBIT_SHIP_ASSET_TOKEN`.

Backend coordinated auth: use `ORBIT_APPEARANCE_RENDER_TOKEN`'s value for both
runtime token variables. Backend accepts that bearer only on its immutable media
route. For a deliberate local/internal HTTP game endpoint also set
`ORBIT_SHIP_ASSET_ALLOW_PRIVATE=true`. Default DNS policy rejects private/reserved
addresses and pins the permitted resolution; URLs cannot choose another origin,
redirect, attach credentials/query strings or escape the hash-addressed path.
No user cookie is forwarded. All bytes are size/hash/static-SVG checked. Chromium
gets embedded originals, with network interception/CSP restricting its requests.

## Files and commands

- `packages/ship-appearance`: shared math/validation/schema, raw RGBA8 PNG decoder,
  browser adapter and real static insignia renderer.
- `tools/ship-appearance`: deterministic compiler, installed-asset adapters,
  authenticated HTTP service, worker browser bundle/CPU worker, local command,
  pure tests, separate Dockerfile and operator README.
- `apps/web/public/art/ship-skins/orbit-light-fighter/concord-v1`: free master,
  frozen maps, preview, manifest/provenance. 4.6 MiB total.

Proposed root npm scripts (integrator owns addition):

```json
{
  "art:ship-appearance": "node tools/ship-appearance/compile.mjs",
  "build:ship-renderer": "node tools/ship-appearance/build.mjs",
  "test:ship-appearance": "node --test tools/ship-appearance/*.test.mjs",
  "ship-renderer": "node tools/ship-appearance/server.mjs"
}
```

Local server needs the renderer bundle and installed pinned Chromium. The complete
commands/configuration are in `tools/ship-appearance/README.md`. The isolated
Dockerfile uses the repository's exact Node 24.18.0 image digest and lockfile-pinned
Playwright 1.56.1 / Chromium; it runs as non-root and includes public originals only.

## Validation and limitations

Validated base `3ac1a649` plus this lane's final source/asset changes, Node 24.18.0,
sharp 0.35.5. Dependency setup completed in 2 seconds; the initial shell's older
Node/npm emitted engine warnings, then all checks/compiler runs used pinned Node.

Final focused tests: **11/11 passed, 1.559 s**, no failures or repair retries.
They cover schema/extensions, packed-PNG decode parity with sharp, exact accepted
reference reconstruction and arbitrary-dye parity, protected glass/propulsion and
alpha, near/paired placement, named dye resolution, size/URL/SVG/hash boundaries,
DNS restrictions, a separately authored square Defense package, transparent PNG/
WebP worker output, HTTP authentication, cancellation, disconnect and retry.
HTTP tests inject the render function; none launch Chromium. Temporary fixture
files, workers and HTTP servers were cleaned up. No task server is running.

Focused ESLint, Prettier, TS syntax transpilation (not a typecheck), all bundled
public SVG validation and git diff whitespace check passed. Package compilation
passed; compile duration was not recorded. No runner/queue/merge delay applies.

**Integrator owns pending validation:** worker bundle build, full types, actual
Chromium POST and trusted backend media fetch; browser foreignObject rasterization
versus worker DOM capture, named treatment examples, desktop/mobile Hangar and
outside-editor screenshots, actual save/equip/reload and output publication; Docker
build/smoke if needed. The visual skill requirements are explicitly deferred by the
single-validation-owner instruction; this lane has not claimed visual approval.
Browser antialiased edges can differ from pinned Chromium; worker bakes are
canonical. New runtime code has not received owner visual acceptance or deployment.

Artwork remains the accepted free Concord source: original hash
`568c862fba527546fc5d0a287faf17ab7676074ac0376a0c61ea236560625b76`, native
1536×1024 RGBA sRGB, supplied AI-finished derivative with unknown external prompt/
model. Maps preserve red propulsion and glass. Reference swatches are navy
`#1e2e40` and gold `#cf9c48`; response RG packs a 16-bit scalar ×5, material G is
accent membership/A coverage, receiver A is decal coverage. Maps never undergo
lossy/premultiplied decoding or pre-render resizing. No new art was generated.
Attribution and applicable CC-BY-SA-4.0 artwork / AGPL-3.0-only tooling provenance
are retained; no private originals or private deployment details were included.
