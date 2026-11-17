# Concord: complete coating and reusable material finish

This study responds to the owner's polished navy/gold Concord reference. The
previous partial masks recolored about half the visible ship and left conspicuous
neutral borders, fin faces, and cockpit surrounds. Its gray-image tinting also
failed to reproduce the reference's metallic highlights and surface finish.

## Review and reproduce

```sh
npm ci
npm run art:livery:finish
npm run art:livery:finish:preview
# http://127.0.0.1:52691/finish.html
npm run test:livery:finish
npm run verify:livery:finish
```

No new image-generation calls were made in this pass. The browser defaults to
**Rose / Platinum**, derived locally from the owner's supplied finished image.
Every palette and arbitrary primary/accent edit runs locally. The browser
verification disconnects the network after loading, then exercises the complete
color workflow and PNG download.

The comparison selector makes each route explicit:

1. **Gray master / previous masks:** the earlier partial-panel implementation.
2. **Gray master / full coating:** original gray pixels, a complete coating mask,
   separate paint/metal tone curves, and markings/layout authored using the
   finished reference. This is not an independent reconstruction without reference
   guidance. No finished-reference illumination pixels are used in this route.
3. **Finished master / local recolor:** the supplied navy/gold image is the beauty
   source. Its actual surface finish and fixed reflections carry into new colors.
4. **Supplied reference:** unchanged source for direct visual comparison.
5. **Material regions:** diagnostic selection display.

`output/finish/progression.png` compares routes 1–3 in identical navy/gold and
pink/platinum recipes. `palettes.png` shows six deterministic finished-master
variants. The unchanged navy/gold result is an identity reconstruction of its
source, **not evidence that the renderer independently generated the AI polish**.

## What changed and what was actually inspected

### Complete coating

The primary coat now includes the wing borders, fin sides, cockpit surrounds,
side faces and bevels. Seams keep their source brightness within the painted
surface instead of being surrounded by broad unpainted outlines. Accent coverage
includes the whole metallic face and its baked markings.

The compiled mask coats **90.15% of the opaque silhouette**, compared with roughly
50.5% in the earlier Concord. About 14.95% of the silhouette is accent material;
75.20% is primary paint. These are image-space areas including all visible
hardware in the denominator, not 3D surface areas. Glass, propulsion emission,
and selected mechanical cavities are protected.

### Review 1: coverage and gray-source material curves

The full-coating gray version already looked markedly more finished than the
previous colored-inset result. Separate contrast curves made the accent stronger,
but the gray source's muted illumination and microtexture still differed from
the approved finish. Changing those curves cannot faithfully recreate missing
reflections or resolve how much of a gray pixel came from paint versus light.

Both original-gray and finished-master results were exported and inspected. The
first finished-master pink/white pass exposed oversized protection polygons:
navy bodywork remained frozen beside the vents and around the forward accent.
These defects were visible in full-size output and enlarged views, not revealed
by the basic protected-pixel tests.

### Review 2: refine semantic selections

The SVG cavity guides are now intersected with dark structure in the gray source
and neutral chromaticity in the finished source. Blue painted bodywork inside a
coarse guide no longer becomes protected machinery. Glass remains separately
protected so bright reflections are not accidentally recolored. Explicit red
emission selection inside two bounded engine regions preserves combustion glow.

The gold/primary material boundary is compiled offline from the approved image's
color separation, then reviewed. This is a change from manually tracing every
panel: the source itself assists selection, while SVG guides protect parts that
must remain fixed. Runtime color selection never rediscovers paint regions by
hue. It consumes the saved, frozen material map.

Review images from before correction remain locally in `output/finish/review01`
and `review02`. This corrected the most conspicuous navy islands. Enlarged wing,
trim and cavity boundaries were inspected again.

### Review 3: improve bright recolors

Recoloring a very dark source to a light surface amplifies small source-channel
quantization and color noise. A small edge-aware filter now smooths the estimated
surface response within a material, preserving boundaries. That response is
encoded at 16-bit precision across two PNG channels. The original detail image
is not blurred. A soft highlight shoulder reduces clipping as dyes get brighter.
Pink and porcelain were inspected again, followed by cobalt, scarlet and obsidian.

### Review 4: endpoints and interaction

A pure-black stress render lost too much shape. Paint now has a small minimum
linear reflectance (0.006) when its chosen luminance falls below that level. This
is an authored paint-display convention, not a measured pigment model. It keeps
black paint readable under the fixed light. It does not affect the six curated
palettes or the reference identity result. Pure white and saturated magenta were
also inspected.

The renderer initially measured about 196 ms in the browser. Reusing tiny local
working arrays instead of allocating them for every pixel brought observed
curated-palette renders to approximately 75–92 ms on this Mac. This is not a
phone benchmark or a promise of sustained 60 fps. A shader implementation remains
an option if continuous dragging needs to be smoother on slower hardware.

## Rendering model

All color arithmetic occurs in linear light. For the finished-master path, each
pixel is modeled as a colored surface response plus a retained residual. The
reference swatches are navy `#1e2e40` and gold `#cf9c48`; the material mask blends
those bases only at boundaries.

The offline compiler estimates a nonnegative scalar response `d` by fitting
source RGB to the reference material RGB plus a neutral component. It applies
edge-aware smoothing to that scalar and encodes it in `response-map.png`:

```text
response = ((R_byte * 256 + G_byte) / 65535) * 5
new_linear_rgb = source_linear_rgb + response * (new_material - reference_material)
```

The residual retains source detail and reflections. The bright-material shoulder
then controls highlights, and mask coverage blends the result with the protected
source. Alpha is copied unchanged. Reusing the reference colors reconstructs the
original bytes exactly in the offline path. Every edit begins from the immutable
source; repeated edits do not compound color loss.

This is an appearance-transfer model, not a physically recovered BRDF or a unique
separation of albedo, lighting and specular reflection. In particular, the metal
response represents colored reflected light, not a claim that metals have a
Lambertian diffuse layer. See the primary descriptions of
[conductor reflection](https://www.pbr-book.org/4ed/Reflection_Models/Conductor_BRDF)
and [diffuse reflection](https://www.pbr-book.org/4ed/Reflection_Models/Diffuse_Reflection).

## Findings and remaining limits

The deterministic approach can preserve a beautiful finished asset across a
useful range of colors. This sample supports spending generation effort on an
approved hull/finish master once, then using local customization. It does not
prove equal quality for every conceivable hue, finish or future hull.

| Remaining limit                                                               | What would improve it                                                                       | Why it is not part of this result                                                                                                                                                 |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The gray source still has flatter reflections and different surface treatment | An approved finish master, authored lighting/specular layers, or a 3D render source         | The gray PNG does not contain the benchmark's new reflection/detail information. This study includes the finished-master route rather than claiming those details were recovered. |
| Colored reflections on glass, machinery and neighboring surfaces remain baked | Separated lighting/reflection passes plus normals/depth, or scene rendering                 | Recoloring an isolated surface does not recompute light bouncing through the scene. Protected glass/engines intentionally retain their original appearance.                       |
| Arbitrary roughness, true chrome, changed lighting or camera                  | Authored material maps and geometry; alternatively an approved master per fixed finish/view | These change reflection shape or expose geometry, beyond the color-change contract tested here. A single image does not uniquely specify that scene.                              |
| Very dark-to-light changes expose source texture and quantization             | Higher-bit-depth production sources and calibrated finish passes; further per-asset cleanup | The supplied beauty is an 8-bit flattened image. Smoothing the response helps but cannot restore information never supplied.                                                      |
| Mask authoring still requires review                                          | Better selection assistance and explicit material layouts at generation time                | The first mask pass had visible defects despite passing basic invariants. Human/agent visual review remains a production gate.                                                    |
| Small browser/offline edge differences                                        | Standardized color management and a shared GPU/CPU precision contract                       | Canvas premultiplication can alter nearly transparent source RGB. Offline checksums establish repeatability of the pinned offline path, not cross-browser byte equality.          |

Research was considered rather than quietly installed. The previously discussed
[Intrinsic implementation](https://github.com/compphoto/Intrinsic/blob/main/LICENSE)
currently states academic use only, so it was not adopted as a commercial game
dependency. No third-party models, API credentials, external services or new
subscriptions are required by this implementation.

## Source package and provenance

`concord-finish-v2/finished-master.png` is a preserved copy of the owner's supplied
AI-finished derivative of the project Concord. The exact external generation
prompt/model was not supplied; no provenance for it is invented. The original gray
source remains untouched in `concord-v1/master.png`. Both source hashes are pinned
in `concord-finish-v2/asset.json`; export refuses unexpected source changes.

`protected.svg` is editable authoring guidance. `finish-authoring.mjs` compiles the
response map; `export-finish.mjs` compiles selections and generates all variants
and comparison boards; `finish-render.mjs` is shared by browser and offline export.
`finish.html`, `finish.css` and `finish-viewer.mjs` provide the isolated atelier.
Generated maps and exports are rebuildable files under ignored `output/finish`.
They are not independently authored sources or player state. The manifest records
source/code hashes, recipes, output hashes and tool versions.

This remains free prototype artwork under the repository's applicable CC-BY-SA-4.0
scope, with AGPL-3.0-only tooling. Attribution: Orbit Imperium contributors /
Unbought Games, LLC. No paid cosmetic originals, production catalog activation,
PR or deployment are included.

## Validation record

Base revision: `6eafeb0c8397eb49ea4b2e1a0b75ed198b801784` plus uncommitted
finish-study files and npm commands. Prior prototype assets and tools remain.
Dependencies were already installed; no additional package/model installation
was needed. No full application build or database check applies to this isolated
static tooling. No CI or merge-queue timing applies.

- Final focused tests: **9 passing**, 1.691 s including test-runner setup.
  Checks exact reference identity, alpha/protected pixels, both source modes'
  canopy/engine protection, independent color groups, non-accumulating edits,
  input validation, response-fit examples, expanded armor coverage and pure black.
- The first numeric fit test required literal floating-point zero and received
  `1.65e-32`. This was a test precision defect, not an image defect. History and
  the repair ledger were checked (this was a new test); its one repair uses an
  explicit `1e-12` tolerance. It passed afterward. No product assertion was removed.
- Initial focused ESLint found one unused test import, which was removed. Final
  ESLint, Prettier and `git diff --check` passed.
- Successive final exports produced byte-identical manifests and all recorded
  output hashes. Export phase duration was not retained. All source inputs are
  hash checked before export.
- Browser verification passed in 3.086 s with no page errors: all six palettes,
  both color inputs, keyboard activation, five comparison modes, retained recipe,
  PNG download, mobile overflow and deliberate image-load failure. The complete
  color/export interaction was executed with the browser offline after load.
- Observed browser render times for six palettes: 74.8, 91.7, 90.9, 90.4, 89.1,
  79.7 ms. These are local desktop observations; mobile layout was tested by
  viewport emulation, not a physical handset performance benchmark.
- Desktop 1440 × 1000 and mobile 390 × 844 screenshots were captured and inspected.
  Comparison sheets, enlarged wing details and pure black/white/magenta stress
  renders were inspected. The pure-black response was corrected and rechecked.
- All task browser processes closed. The local preview server remains available
  at port 52691 for review. No production application, catalogs or fleets changed.
