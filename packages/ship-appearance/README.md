# Ship appearance runtime

Pure, fixed-view material and projected insignia rendering shared by browser and
Node. Version `finish-decal-v1` carries the accepted Concord finish and EMBLEMS
paint algorithms without automatic contrast correction, outlines, hue changes or
symbol simplification. It preserves source alpha and protected glass/propulsion.

`browser.tsx` exports `ShipAppearancePreview`. Pass the canonical catalog `skin`,
resolved `{primary, accent}` hex `colors`, actual `InsigniaAppearance | null` as
`emblem`, explicit `treatment` (`none`, `full`, `layers`) and `placement`
(`near-wing`, `paired`). Optional `className`, `alt`, `onError(message)`.

The preview fetches only installed package paths and same-origin hash-addressed
game insignias. Package and insignia bytes are SHA-256 checked. It retains the
previous rendered artwork while preparing a replacement, ignores stale async
completions, and starts with the catalog preview. No recipe or derived game state
is persisted. Package/texture promises are bounded to the component's latest
input; they are disposable render resources. Package dimensions replace the
initial 3:2 placeholder on load.

`index.mjs` exports `renderShipPixels(package, colors, emblemTexture?)` for Node
and browser callers. `types.ts` defines data contracts. The renderer takes decoded
RGBA maps, a validated manifest and optional bounded texture. It never accepts
executable shaders or external URLs. The ship pixel math is independent of React,
networking, authorization and storage. `png.mjs` decodes the narrow RGBA8 package
format without browser premultiplication corrupting packed maps. Hashes are
checked before decoding.

`static-insignia.tsx` uses the real `EmpireInsignia` and its CSS/treatment code.
Named dye recipes require authoritative resolved `rendering` colors and resolved
layer colors. Finish/light/interaction treatments use the existing reduced-motion
static appearance: animations disabled, fixed background position, no active
pointer/focus effect, pointer reference 50% / 40%, no badge shadow or 3D transform.
The explicit layers mode omits background/border only; original shapes, clipping,
insets, ordering and all layers remain. It does not silently convert a player's
selected palette or remove low-contrast detail. Browser foreignObject rasterization
and the worker's pinned Chromium DOM capture use the same markup and CSS; browser
raster engines can differ at antialiased edges. The worker is the authoritative bake.

## Package format

Installed package route: `/art/ship-skins/<id>/<revision>/manifest.json`.
The v1 manifest pins renderer `finish-decal-v1`, native width/height (1–2048),
reference primary/accent colors, SHA-256 and byte counts for five RGBA8 PNG maps,
convex decal quads, bounded paint response, attribution and source provenance.
Map roles: `source`, `material`, `response`, `receiver`, `decalResponse`.
No manifest scripts, shaders, fetch URLs, CSS or player-supplied geometry execute.
Only trusted authoring installs packages. The worker installs
`orbit-light-fighter/concord-v1` and `orbit-base-light-fighter/v1` by default. Additional packages use the service’s bounded data-only
`ORBIT_SHIP_PACKAGES` registry and installed package directory without code changes.

The accepted source is the owner's supplied AI-finished Concord derivative; its
external model/prompt was not supplied. Attribution: Orbit Imperium contributors /
Unbought Games, LLC. Artwork is CC-BY-SA-4.0 under the repository's artwork scope;
tooling is AGPL-3.0-only. This public package is free content. Private originals
are never embedded in this package or its tests.
