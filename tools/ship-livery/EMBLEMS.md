# Concord empire-insignia proof

Status: technically demonstrated locally; owner review of the emblem treatment and
placement remains separate from acceptance of the existing Concord finish.
No game backend, shipyard integration, publication, deployment or AI generation
was performed. Base checkout: `6eafeb0c8397eb49ea4b2e1a0b75ed198b801784`
plus the uncommitted livery studies and this proof.

## Finding

The prepared Concord can carry real Orbit empire insignias convincingly enough
to include emblems in the development-only first slice. Recommend the authored
paired-wing placement at the 100% size. A near-wing-only placement also works.
75% is quieter but loses detail sooner; 125% is more prominent and leaves less
margin around existing markings. These are art judgments, not player color rules.

**Players own the relationship between their emblem colors and their hull colors.**
Keep selected colors and layers. Do not automatically change hues, drop symbols,
add outlines or reject a combination because it has low contrast. An optional
black outline is a possible future explicit treatment; it is not implemented or
silently applied here. The pale-on-pale comparison intentionally remains pale.

Two concrete treatments are demonstrated:

- **Full insignia:** original background shape, background color, border, all
  layers, their ordering and their colors. The component's screen-space drop
  shadow is omitted; a shadow behind a UI badge is not painted ship geometry.
- **Painted layers:** explicit omission of the background and border. All symbol
  layers, colors, shape clipping and insets remain. This is not an automatic
  extraction of a preferred central symbol. The preview shows the original badge
  beside the result so the difference is visible.

The transparent treatment feels integrated with the hull. Full insignias read
as painted national/unit badges and retain their own contrasting backdrop. Both
are legitimate choices, independent of whether a particular palette matches.
The ship's existing gold identification bars remain part of the immutable master.

## Real game inputs

`emblem-fixtures.ts` imports the actual `compositionAppearance` and `recipeAccess`
functions; `emblem-viewer.tsx` renders the actual `EmpireInsignia` React component
and its CSS module. This is not a reimplementation of the showroom's sample marks.
The normal recipe schema validator checks the examples before capture. Public
catalog IDs/groups are mapped from `crates/application/src/insignia.rs`:

| Example                | Background | Composition                                  |
| ---------------------- | ---------- | -------------------------------------------- |
| Crowned Wayfinder      | Shield     | Wayfinder center, Crown accent               |
| Starwing roundel       | Circle     | Starwing center, Twin moons accent           |
| Ringed planet standard | Hexagon    | Horizon bands, Ringed planet, Diagonal stars |
| Ascendant diamond      | Diamond    | Chevron bands, Ascendant, Crown              |

These are authored valid version-2 example recipes with literal colors, using
freely bundled art and the existing unrestricted composition policy. They are
not production player records and do not establish any new entitlement grant.
The shipped named-dye path must resolve authorized dye IDs before rasterization.
There are no private/supporter originals. Animated/interactive cosmetic treatments
are absent; a production static treatment policy remains to be defined.

The example colors come from the existing composer's palette vocabulary. Source
SVGs retain their repository license/attribution. The exporter records their exact
hashes, the component/composer/CSS hashes, recipes, browser version and output hashes.
No production access or external provider is required.

## Deterministic process

1. Capture the real static game composition to a transparent texture in pinned
   Chromium after its mask images load. Separate full/layers captures make the
   treatment explicit. Integer capture geometry prevents fractional CSS bounds
   adding a raster row. This headless browser is an offline/bake adapter, not
   something every client must launch or a new AI service.
2. Bind `concord-emblems-v1/slots.json` to the approved master SHA-256. It contains
   native image dimensions and two ordered quadrilaterals. Both symbols face the
   same authored direction; opposite-wing symbols are not mirrored.
3. Compile `receiver.svg` with the existing frozen primary-material mask. This
   excludes trim, canopy, machinery and functional emission; authored joint
   exclusions can preserve panel gaps. Slots deliberately fit clear wing panels.
   The shader also preserves source alpha exactly. These are fixed visible-surface
   masks, not a recovered 3D depth buffer or arbitrary-camera occlusion solution.
4. Compile a decal response from the existing source response map and bounded
   high-frequency source detail. The ratio between source luminance and a blurred
   source transfers fine finish texture. It is empirical fixed illumination, not
   normals, physical roughness or reconstructed light transport.
5. Inverse-project each target pixel into the texture. Sample premultiplied
   linear RGB with bilinear interpolation and four subpixel samples. Blend ink
   through the receiver, using the frozen response and fixed 0.96 paint opacity.
   No hue matching or palette-dependent ink substitutions occur. The response
   changes the lit appearance of a pigment as expected on a surface.
6. Bake from the recolored master every time, never from a previously decaled
   image. Transparent size variants derive from that full-size result. Identical
   rendering inputs can share bytes across accounts/universes.

The placement/rendering function takes dimensions, texture, slot geometry and maps
as data; it is not hardcoded to these emblem shapes. The authoring setup and finish
source remain Concord-specific. Generic package validation/distribution is still W1.
The preview selects previously baked combinations; it does not claim to implement
a production live browser decal editor or its performance budget.

## Visual iterations and evidence

`output/emblems/` is reproducible ignored output:

- `recommended.png`: four different compositions and hull palettes.
- `treatments.png`: full badge versus painted layers for all four compositions.
- `contrast.png`: the same Crowned Wayfinder across all four hull palettes;
  deliberately retains low contrast on porcelain.
- `size-placement.png`: 75%, 100%, 125% and near-wing-only comparison.
- `surface-closeups.png`: flat overlay, source lighting, then lighting plus fine
  texture, followed by three other materials/compositions at enlarged scale.
- `original-insignias.png`: actual game-rendered source textures for both treatments.
- `placement-guide.png`, `receiver.png`, `decal-response.png`: authoring diagnostics.
- `desktop-1440x1000.png`, `mobile-390x844.png`: inspected final running preview.
- `manifest.json`: source, composition/art, tool/version and output identity.

First pass: accurate composition/perspective already read as markings, but flat
ink looked pasted on. Source lighting improved it; the second material pass added
fine source texture, which is visible in the enlarged comparison. No AI replaced
the result. Four compositions × four hull palettes × two treatments × two placements
produce 64 deterministic full-size examples.

At 320 px ship width, the major emblem identity remains readable. At 160 px,
simpler marks fare better and fine layers begin to merge. At 80 px, these are
colored identification details, not reliably readable heraldry. Keep the normal
separate empire insignia where identity must be accessible/readable; do not enlarge
the ship decal automatically or silently simplify its layers at small sizes.

## Checks and limitations

Run from the repository root:

```sh
npm run art:livery:finish
npm run art:livery:emblems
npm run test:livery:emblems
npm run art:livery:emblems:preview
# http://127.0.0.1:52701/tools/ship-livery/emblems.html
```

Focused checks protect premultiplied-alpha sampling, projected clipping, unchanged
outside pixels/alpha, fixed illumination independent of hull color, map dimension
rejection and exact rerender parity for an actual composition. Existing finish
checks remain applicable. Browser verification loads both treatments for all four
compositions, single/paired placement, and desktop/mobile layouts with no overflow.

Final focused result: **14/14 tests passed** (five emblem checks plus nine
existing finish checks), 1.734 seconds wall time reported by Node. Final browser
verification reports zero page errors and zero HTTP errors at both viewports.
No dependency installation, database or container preparation was needed. Browser
export/setup phase timings were not separately recorded. Focused ESLint, Prettier
and whitespace checks passed; temporary export browsers/servers were closed.
The optional preview command starts only a loopback development server.

Validation repairs during authoring (not unexplained green retries): the first
export check incorrectly classified HTTP 304 as a failed request; it now checks
HTTP error status. A newly added exact label lookup exposed the preview's nested
label text; explicit labels associated with separate selects corrected the control
markup. The first actual-raster unit test assumed 576 rows while a fractional
browser capture produced 577; capture geometry was made integral and the test
now reads the texture's actual dimensions. No product assertion was weakened to
hide a rendering defect. No expensive game build/browser suite was run.

Limitations: baked lighting, fixed planar slots, no moving view, no automatic
surface discovery, no arbitrary placement through other geometry, no transparent
emblem relighting based on a physical scene, and no animated treatment bake policy.
At extreme enlargement source grain and raster edges are visible. Improved sources
or a separately authored lighting/detail pass could improve that; 3D geometry and
material rendering would be needed for camera/lighting changes. None is necessary
for the proposed fixed-view first slice.

## First-slice contract changes

Demonstrated locally: real static compositions, two explicit treatments, paired
or single authored slots, fixed lighting/detail, protected areas and 64 exports.
Proposed production implementation: immutable emblem recipe/art/composer revision
references, validated slot selection, compiled receiver/response maps, trusted
static composition adapter, authorized dyes and durable bakes/size variants.

Bake identity must include skin/master/maps/renderer revisions; hull colors;
emblem composition, shape, layer order, resolved colors and art revisions;
composition-renderer revision; treatment; slot geometry/placement and paint settings;
output size, format and color/alpha policy. Account, empire and universe identify
ownership/equipment, not rendering inputs, and must not partition identical bakes.
Saving a new immutable recipe revision updates only equipment explicitly selected
in the current universe. Other universes continue using their pinned revisions.
Updating an empire insignia must not silently rewrite an older saved ship bake.
