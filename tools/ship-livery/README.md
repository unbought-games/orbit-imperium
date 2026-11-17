# Light Fighter: one master, deterministic liveries

For new work, start with the [asset customization delivery plan](../../docs/plans/asset-customization/README.md)
and [repeatable authoring guide](../../docs/operations/recolorable-asset-authoring.md).
This directory records prototype evidence; it is not yet the generic production package API.

The [Concord finish study](FINISH.md) replaces partial-panel coloring with full
coating and tests deterministic recoloring of an approved finished master.

The follow-up [two-civilization experiment](CONCEPTS.md) adds Rupture and Concord,
with primary/accent paint and fixed red combustion glow.

A complete agent-authored experiment for Orbit Imperium, 2026-11-14. The prior
shipyard review chose a cinematic fixed-camera showroom and required all asset
production to be feasible for agents. This experiment proves the art pipeline
independently of the game client. It does not replace shipped art or integrate
account dyes, equipment, entitlements, saves, or the earlier showroom branch.

## Run and reproduce

From the repository root:

```sh
npm ci
npm run art:livery
npm run art:livery:preview
# http://127.0.0.1:52671
npm run test:livery
```

The preview works offline after dependencies and artwork are available. No API
credentials or network calls are involved in recoloring. It offers three presets,
three independent color groups, a wing band, two perspective-attached chevrons,
two restrained finish treatments, original/debug views, and transparent PNG export.
Selections are local interaction state; no persistence or production equipment is
implied. The static preview is outside the application build.

## Service and offline-tool investigation

This is a documentation-based capability comparison, not a benchmark of paid
services. Only built-in image generation and the local renderer were executed.
Stripe Directory was attempted first, but its CLI plugin lookup returned an
expired-credential error. Provider documentation was used instead. No external
accounts, subscriptions, uploads to these providers, or purchases were made.

| Stage / option                                                                                                  | What it supplies                                                                                  | Decision for this experiment                                                                                                                                                |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Built-in image generation                                                                                       | A new high-detail master from our existing fighter reference, including alpha                     | Used once. Preserve the returned file; a prompt is provenance, not a reproducible source image.                                                                             |
| [Photoroom segmentation](https://docs.photoroom.com/image-editing-api-plus-plan/alpha-text-guided-segmentation) | Text-guided foreground selection; its editing API also provides background removal                | Useful authoring candidate when extraction is difficult. A selected object is not a reviewed set of armor panels. Requires service credentials; not needed for this master. |
| [SAM 2](https://github.com/facebookresearch/sam2)                                                               | Promptable image segmentation, downloadable code and checkpoints; Apache 2.0 model/code licensing | Strong candidate to propose complex panel masks at fleet scale. Persist and review its output offline; do not infer masks on each paint change.                             |
| [SAM 3](https://github.com/facebookresearch/sam3)                                                               | Text/concept-assisted segmentation                                                                | Investigate on a suitable GPU host. Current documented setup requires CUDA and gated checkpoint access; not a straightforward dependency on this Mac.                       |
| [Cloudinary](https://cloudinary.com/documentation/generative_ai_transformations)                                | Hosted transformations, including generative recoloring                                           | Potential delivery infrastructure; generative recoloring gives insufficient control for our pixel invariants. We can render locally without a service dependency.           |
| [Meshy image-to-3D](https://docs.meshy.ai/en/api/image-to-3d)                                                   | Mesh generation, texture/PBR options, downloadable formats                                        | A worthwhile separate rotation experiment. It adds inferred hidden geometry, camera matching and material cleanup to the quality gate. Not required for this fixed view.    |
| [Tripo](https://developers.tripo3d.ai/en/docs/introduction)                                                     | Image/multiview-to-model, mesh segmentation, texturing and conversion APIs                        | Similar 3D alternative. Documentation establishes capabilities, not exact fidelity to this ship or production-ready armor grouping.                                         |
| [Intrinsic decomposition research](https://github.com/compphoto/Intrinsic)                                      | Estimated reflectance and illumination layers, including recoloring examples                      | Relevant to better shading separation. Estimates are not ground-truth render passes. Evaluate code/model licensing, setup and quality before adoption; not used here.       |
| [Blender render passes](https://docs.blender.org/manual/en/latest/render/layers/passes.html)                    | Material/object masks through Cryptomatte, shading and other passes from a scene                  | Best controlled source if we later have an acceptable 3D master. It does not recover a fully authored scene from this PNG.                                                  |
| SVG + [Sharp/libvips](https://sharp.pixelplumbing.com/api-composite/) + Canvas                                  | Explicit boundaries, rasterization, deterministic image math, local exports                       | Used. Small dependency footprint, agent-editable geometry, inspectable outputs; no per-customization service cost.                                                          |

Recommendation: buy inference only where it reduces authoring work. Freeze the
results into an ordinary asset package. Keep the player's color changes local.
Try segmentation assistance when hand-authoring masks becomes the measured
bottleneck; try image-to-3D when rotation becomes a product requirement. Neither
is a prerequisite for a useful illustrated configurator.

Depth/normal estimation could support modest parallax or approximate lighting,
but cannot expose correct unseen surfaces. Prompted relighting and super-resolution
can change small details; if used during authoring, freeze the resulting master
before drawing masks. A cache or fixed random seed does not establish geometric
correctness. Separate backgrounds can be composed behind this transparent ship;
the experiment uses a quiet procedural stage to expose edge defects clearly.

## Repeatable authoring process

1. **Define identity.** Preserve the narrow central canopy, twin separated
   cylindrical drives, swept outer winglets and paired tail fins. Reference the
   existing project-owned fighter. Avoid third-party franchise references.
2. **Generate for control.** Request neutral gray armor, broad uninterrupted
   surfaces, clear bevels, protected mechanisms, two emblem surfaces, a complete
   silhouette, moderate lighting and actual transparency. The exact prompt is in
   `light-fighter-v1/prompt.txt`. The built-in tool produced one 1536 × 1024 master.
3. **Freeze the beauty image.** Store the actual PNG and checksum. Inspect it
   against light and dark backgrounds. Do not generate a new image for each dye.
4. **Author region geometry.** Eight SVG paths cover two wing panels, two cowls,
   two nose regions and two fin faces. Three RGB channels encode the paint groups.
   Explicit holes protect the cowl vents. Bevels remain unpainted deliberately;
   not every white hull surface is customizable in this version.
5. **Author decal surfaces.** Two ordered quadrilaterals define local wing UV
   coordinates. Inverse homographies project bands and chevrons into those planes;
   masks clip them to the paintable surfaces. Contrasting emblem ink is derived
   from the primary paint luminance. These simple original marks are free fixtures.
6. **Render from source.** Convert sRGB to linear light, derive luminance from the
   neutral master, shade each dye, blend only within the masks, then encode sRGB.
   Preserve master alpha exactly. There is no color classification and no AI call.
7. **Review adversarial colors.** Inspect white, near-black and saturated paint,
   debug masks at source resolution, both wing emblems, and protected dark details.
   Export from the same function used by the viewer.
8. **Validate and package.** Record master/mask/renderer hashes and tool versions,
   compare repeated exports, run deterministic pixel tests, and inspect desktop
   and mobile captures. Never reuse masks with a changed master without retracing.

The three shared groups are intentionally bounded. More panel groups can be
added by extending the format rather than guessing from the current paint color.
A future game recipe should reference stable asset/dye/pattern/insignia IDs; the
renderer can resolve their installed data without storing derived game state.

## Files and ownership

- `light-fighter-v1/master.png`: immutable generated source, not an alternate view.
- `light-fighter-v1/panels.svg`: editable authoritative masks in master coordinates.
- `light-fighter-v1/asset.json`: coordinate system, groups, surfaces and provenance.
- `light-fighter-v1/prompt.txt`: exact image-generation request and reference role.
- `render.mjs`: pure renderer shared by browser and Node, including projection math.
- `export.mjs`: mask rasterization, three livery PNGs, debug PNG, comparison sheet
  and checksums. Generated outputs are ignored by Git and recreated by the command.
- `viewer.mjs`, `index.html`, `style.css`: isolated interactive preview.
- `render.test.mjs`: deterministic invariants and perspective projection coverage.

Ordinary artwork, masks, prompts and documentation follow the repository's
CC-BY-SA-4.0 terms. Attribution: Orbit Imperium contributors / Unbought Games, LLC.
Code follows AGPL-3.0-only. This is free prototype content. No paid/supporter
originals are included. See the repository LICENSE for the full scope and generated
artwork provisions. Do not put future restricted originals in this public package.

## Limits and next decision

The master retains baked lighting. The renderer estimates shading from gray
armor; it does not recover a physically correct albedo/specular separation.
Satin/matte changes highlight contribution only. There is no moving reflection,
real metallic material replacement, rear view, rotation, or inferred geometry.
Decal edges use four subpixel samples; the finite master resolution still limits extreme zoom. Browser color management and Canvas
premultiplication can cause small differences from Node's raw RGBA exports,
particularly in nearly transparent edge pixels. Reproducibility means identical
inputs and pinned tools on the same rendering path; cross-device byte identity is
not promised. Browser export omits CSS stage/background and drop shadow.

This package proves recognizable, immediate customization of selected panels.
It does not establish that every fleet asset can be automatically segmented.
Before scaling, review this design's visual quality with the owner, establish
approved paint coverage, then measure mask-authoring time on a more complex hull.
The next technical improvement should target that measured bottleneck, not add a
runtime dependency merely because an API exists.

## Verification record

Base revision: `6eafeb0c8397eb49ea4b2e1a0b75ed198b801784` plus this uncommitted
package and three npm commands. No production code, routes, existing master art,
lockfile or changelog changed. No PR, merge or deployment was requested.

- Dependency preparation: `npm ci --ignore-scripts --no-audit --no-fund`, about 3 s.
- Final `npm run test:livery`: six passing tests, 0.745 s including runner setup.
  They protect unchanged alpha/unpainted pixels, group independence, deterministic
  reproduction, known glass/vent/engine probes, original mode and decal geometry.
- Two successive `npm run art:livery` runs produced identical manifests and PNG
  checksums. Each manifest records source, asset metadata, mask and renderer hashes,
  recipes, Node, Sharp and libvips versions. Export phase timing was not retained.
- ESLint passed for the four `.mjs` files with explicit browser/Node globals;
  Prettier and `git diff --check` passed. Full application build/typecheck was not
  run: the preview is isolated static tooling and changes no application code.
- Final Chromium walkthrough: 2.776 s; no page errors. Exercised all three color
  inputs, every preset, pattern/insignia/finish controls, keyboard activation,
  original/mask inspection, PNG download, mobile overflow and failed-image loading.
- Desktop 1440 × 1000 and mobile 390 × 844 screenshots were captured and inspected.
  Light/dark compositing and an enlarged wing/vent/decal view were also inspected.
- One browser walkthrough attempt stopped on an exact implicit-label lookup for
  the selects. Explicit accessible names resolved that ambiguity. Final walkthrough
  passed. No product assertions were removed or timeouts increased.
- A single final full-resolution browser render measured 85.6 ms on this Mac;
  this is a local observation, not a mobile-device or sustained-animation benchmark.
  An early render measured 174.9 ms. Skipping unpainted pixels before allocating
  intermediate arrays reduced work without changing the rendered image.
- Browser processes closed after validation. The loopback-only preview server is
  intentionally left running for owner review on port 52671. No CI/runner queue or
  merge timing applies. Generated inspection/output files remain local and ignored.

The final master hash is
`251001d3ee7ea98c218a85414a08ee1c0653a2cc2e839e1ac39349674ff41b75`.
The authoritative output record is `output/manifest.json`, recreated by export.

## Real empire insignias

The [Concord emblem proof](EMBLEMS.md) uses the actual game composition renderer,
public catalog elements and authored surface projection. It records inspected
full-badge/layer-only alternatives, palette/size comparisons and first-slice limits.
