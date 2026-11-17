# Two civilizations, two paint channels

This second pipeline experiment builds two original single-pilot Light Fighter
concepts from abstract design philosophies, independently of paint color.
Both use the same elevated front three-quarter orientation: nose nearest the
viewer at lower-left, tail receding toward upper-right. This is a shared camera
brief, not a mathematically calibrated camera recovered from a 3D model.

## Run the experiment

```sh
npm ci
npm run art:livery:concepts
npm run art:livery:concepts:preview
# http://127.0.0.1:52681/concepts.html
npm run test:livery:concepts
npm run verify:livery:concepts
```

The preview lets you switch hulls while keeping the same primary/accent choices.
Three shared palettes—Graphite/Brass, Pearl/Aubergine, Copper/Petrol—deliberately
avoid assigning philosophical color pairs to the ships. Both colors are freely
editable. Markings offer unmarked surfaces, two projected chevrons, or accent
bands. Neutral-master and mask views expose the authoring inputs. Export saves
what the canvas shows as a transparent 1536 × 1024 PNG.

The browser verification is explicit local acceptance; it is not added to CI.
It requires the preview server above. `LIVERY_CAPTURE_DIR` optionally chooses the
screenshot directory; the default is under ignored `output/concepts/verification`.

## Design briefs

|                       | Rupture                                                             | Concord                                                               |
| --------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Civilization premise  | Instinct, freedom, strength, immediate action                       | Order, control, rational planning, collective security                |
| Silhouette            | Short chisel nose, broad separated shoulders, forward claws         | Integrated delta, tapered prow, aligned paired stabilizers            |
| Construction          | Thick faceted armor, exposed spars and mechanical connections       | Flush interfaces, recessed mechanisms, repeated geometric divisions   |
| Primary paint         | Shoulder armor, nose plates, dorsal housing, rear cowl faces        | Broad wing panels, prow, central dorsal spine                         |
| Accent paint          | Forward claws, aft cowl rails, dorsal insert                        | Wing-edge strips, fin leading faces, narrow fuselage inlays           |
| Family rules to reuse | Concentrate mass, expose purposeful structure, favor emphatic forms | Repeat alignments, integrate systems, preserve orderly negative space |

The inspiration is philosophical. Wizards' descriptions of
[red–green](https://magic.wizards.com/en/news/making-magic/aaaargh-2006-01-30-0)
emphasize action, impulse and instinct; its
[white–blue](https://magic.wizards.com/en/news/making-magic/slow-and-steady-2006-05-01)
description emphasizes thoughtful, controlled order. These are interpretation
inputs, not factions or lore imported into Orbit. No Magic artwork, symbols,
guild logos, trees, bones or literal nature motifs were used.

Rupture is meant to feel powerful and alive without skulls or indiscriminate
cruelty. Concord is meant to feel composed and authoritative without making
white/blue paint do the work. The two ships remain visibly different when wearing
identical colors or when shown as neutral masters. Their forms are new original
concepts; the previous Light Fighter was not used as a generation image reference.

## Gameplay grounding and propulsion

`rules/mvp-v1-slice-11.json`, LightFighter catalog entry at lines 761–782, requires
Shipyard level 1 and **CombustionDrive level 1**. Its movement definition at lines
159–167 records base speed 12500, drive coefficient 1/10, fuel 20 and capacity 50.
The art experiment does not alter those statistics or imply different combat
roles/stats for the two concepts. Single-pilot scale is the owner's design brief,
not a new gameplay crew mechanic.

The owner's requested visual convention is:

- Combustion: red glow, with orange-red hot centers allowed.
- Impulse: blue glow.
- Hyperspace: faint green glow.

Both fighters are combustion designs. The localized red heat/exhaust recesses
remain outside every paint mask. The tests protect explicit engine rectangles as
well as canopy and mechanical sample points. These color conventions are art
direction, not values read from the game rules. No impulse/hyperspace art was made.

## Production recipe

1. Write the civilization's shape/construction brief separately from its colors.
2. Reuse the camera, material, paintability, cockpit-scale and propulsion contract.
3. Generate a neutral transparent master. Both final masters here came from one
   built-in image-generation call each. Exact prompts are retained in each package.
4. Freeze the PNG and bind the package to its SHA-256. `export-concepts.mjs`
   refuses a mismatched master; changing it requires an explicit mask review.
5. Trace SVG paths over actual panels. This remains agent-authored work; image
   generation does not supply reliable material segmentation. Gaps and selected
   bevels are intentionally unpainted. Each mask uses red for primary and green
   for accent, with no blue channel. Those debug colors are unrelated to liveries.
6. Author ordered four-corner decal surfaces in source-image pixel coordinates.
   Two per ship allow perspective-correct planar projection and mask clipping.
7. Use the shared renderer for local previews and PNGs. Convert source gray to
   linear-light luminance, shade the selected dye, preserve the original alpha
   and every pixel outside the masks, then convert back to sRGB. No generated
   livery images and no color-based guesses about which panels are paintable.
8. Inspect matching palettes, bright debug overlays, white/dark backgrounds and
   enlarged panel boundaries. Exercise black, white and saturated paint in tests.
9. Export independently reproducible packages, manifests and a six-livery board.

The exporter records hashes of master, metadata, masks and renderer; exact
recipes; tool versions; output hashes; and measured paint coverage. Generated
outputs stay ignored and can be recreated. The old prototype and unrelated Roman
Republic concepts are preserved. The shared renderer now supports either two
or three groups; the original three-group tests remain in the focused command.

## Packages

- `rupture-v1/master.png`, `concord-v1/master.png`: frozen neutral sources.
- Each package's `prompt.txt`: exact built-in image-generation request.
- Each package's `panels.svg`: editable authoritative panel boundaries.
- Each package's `asset.json`: groups, source hash, projection quadrilaterals,
  protected points, engine rectangles and provenance.
- `concepts.mjs`: design summaries and shared two-color recipes.
- `render.mjs`: shared deterministic renderer, compatible with the first prototype.
- `export-concepts.mjs`: batch export for both packages and their comparison board.
- `concepts.html`, `concepts.css`, `concept-viewer.mjs`: isolated local preview.
- `concepts.test.mjs`: per-hull source, paint-isolation and engine-protection tests.
- `verify-concepts.mjs`: explicit browser interaction/export/layout verification.
- `output/concepts/<id>/`: generated mask, three liveries, debug image and manifest.
- `output/concepts/comparison.png`: same three recipes applied to both hulls.

## What this experiment establishes

Paint covers approximately **44.7% of Rupture's opaque silhouette** (36.4% primary,
8.3% accent) and **50.5% of Concord's** (38.4% primary, 12.2% accent). These are
image-space areas, not 3D surface areas; the denominator includes glass, mechanisms
and unpainted structure. Both have much broader paintable areas than the first
experiment. Not every neutral armor face is painted.

A two-color recipe meaningfully changes each ship, and the same recipe remains
coherent on both. The generated designs supply large surfaces worth coloring.
The reusable part is the asset contract, renderer, exporter, validation and
preview. The variable work is art direction and tracing/reviewing panel geometry.
We have not demonstrated automatic fleet-wide segmentation or measured a stable
per-ship production cost from this small sample.

Lighting is baked in. Paint preserves source texture and brightness, but the
shading/specular split is an approximation. There is no camera rotation, physically
accurate relighting or proof of hidden geometry. Raster masks and decal sampling
limit extreme zoom. Browser Canvas can differ slightly from offline RGBA output
at translucent pixels due to premultiplication; deterministic export means the
same inputs and pinned local toolchain, not byte identity across all browsers.

Next decision: review whether each silhouette expresses its intended civilization
and whether the paint split feels satisfying. Only then extend a design family
to another hull class. Segmentation assistance is optional if mask authoring
becomes the bottleneck; it is not required to run this package.

## Provenance and distribution

Created 2026-11-14 using the OpenAI built-in image_gen tool, followed by authored
SVG masks and local rendering. All new art is free prototype content covered by
the repository's applicable CC-BY-SA-4.0 scope; code is AGPL-3.0-only. Attribution:
Orbit Imperium contributors / Unbought Games, LLC. See the repository LICENSE for
generated-artwork provisions. No restricted cosmetic originals or third-party
artwork were included. No production integration, entitlement changes, PR or
deployment is part of this experiment.

## Verification record

Tested base revision `6eafeb0c8397eb49ea4b2e1a0b75ed198b801784` plus the
uncommitted concept package and shared renderer changes in this checkout.
Existing uncommitted first-experiment and Roman Republic assets were retained.

- Dependency preparation: `npm ci --ignore-scripts --no-audit --no-fund`, about 3 s.
- `npm run test:livery:concepts`: all 16 tests pass; final runner time 3.293 s.
  Includes six original three-group regressions and ten new per-concept checks.
- Two successive `npm run art:livery:concepts` exports produced identical
  manifests and livery PNG checksums. Export phase duration was not retained.
- `npm run verify:livery:concepts`: passed in 7.849 s with zero page errors.
  Checks both hulls, both color controls, every palette, retained choices when
  switching hulls, markings, all inspection views, keyboard activation, PNG
  downloads, mobile overflow and intentionally failed asset loading.
- Inspected both concepts at 1440 × 1000 and 390 × 844, plus their desktop
  marking states, bright region overlays and enlarged panel/decal boundaries.
  The desktop stage was resized after initial inspection to keep the entire
  silhouette and footer in the viewport. Captures were refreshed afterward.
- The initial screenshot script used an ambiguous `data-ship` selector matching
  both a button and the canvas. It stopped before capturing. Both the interaction
  selector and UI button updates now explicitly select buttons. No assertions
  were removed and no timeout was increased; final browser verification passes.
- ESLint initially flagged the verification script's browser `innerWidth` global
  because the ad hoc lint invocation omitted it. Rerunning with explicit browser
  and Node globals passed. Prettier and `git diff --check` also passed.
- No full application build, database tests, CI queue, PR or deployment applies
  to this isolated static art tool. No application source or game rules changed.
- Browser processes were closed after verification. The loopback preview server
  remains running on port 52681 for owner review. Generated outputs are ignored.
