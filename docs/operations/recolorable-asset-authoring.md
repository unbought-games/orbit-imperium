# Authoring one recolorable asset

Status: repeatable creative workflow established from the Concord experiments;
generic production packaging is proposed in [the package contract](../architecture/recolorable-asset-packages.md).
Start from the [delivery plan](../plans/asset-customization/README.md) for project
scope and integration status. This guide covers one skin revision at a time.

## Ownership and scope

**Ethan owns how it looks and feels. The agent owns making it reliably recolorable.**
Ethan may supply a sketch, silhouette, rough generation, beautiful finished image,
or a design brief. The agent helps refine it, prepares material controls, implements
or adapts reusable processing, and repeatedly inspects the actual result. Creative
exploration is part of the workflow; several generations and revisions are normal.

The output is an authored asset that players can recolor without inference. This
applies to ships first and can extend to defenses, buildings or another suitable
catalog object. Do not assume every target has a cockpit, engines, weaponry, or
an identical silhouette. Research is not included merely for schema uniformity.

This is distinct from the game's player-generated image feature. A player-created
raster does not automatically become an authored skin with masks. This authoring
workflow can prepare a new curated skin later if deliberately commissioned, but
it is not a background promise for every generated player image.

## Start with a portable brief

Record these inputs beside the source artwork; resolve only missing decisions
that materially affect the work. Reuse explicit prior approvals and supplied
references rather than repeatedly asking for the same permission.

| Input                 | What to record                                                                                                                   |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Target                | Category and exact canonical rules/catalog ID; collection and proposed skin ID                                                   |
| Creative premise      | Role, silhouette, construction language, recognizable distinguishing features; owner references and features to preserve         |
| Game facts            | Relevant scale/crew brief, drive/weapon/building role from current rules; distinguish actual rules from aesthetic interpretation |
| View                  | Intended camera/orientation, complete silhouette, transparent or approved background policy, framing and output dimensions       |
| Materials             | Primary paint, accent material and protected regions; anticipated reflective, emissive, glass and mechanical details             |
| Optional capabilities | Actual emblem slots, pattern surfaces, alternate finish/view masters; do not advertise unauthored capabilities                   |
| Distribution          | Free/public versus separately distributed restricted content; rights/provenance and source destination                           |
| Quality target        | Owner-approved image or clearly described visual bar; expected player-visible sizes                                              |

For the canonical ship collection, the established default is an elevated front
three-quarter view, nose toward the viewer and lower-left. Combustion glow is red,
impulse blue, hyperspace faint green. Treat those as asset-specific protected
emission, not a third user paint channel. Read actual rules, including upgrades,
before choosing a propulsion brief. Defenses/buildings need their own view and
functional-lighting decisions instead of inheriting ship assumptions.

A philosophical reference describes construction and character; it does not
assign the asset's paint colors. Test the same palette on different designs to
check whether their identity survives independently of color.

## Explore and establish the master

1. **Find the object.** Work from the owner's rough shape or brief. Explore until
   the silhouette, scale and construction feel right. Avoid solving color controls
   by flattening every design into the same simple, uninteresting form.
2. **Find the finished appearance.** Generate or refine a beautiful product-quality
   image with believable materials. One or two colored finish references are useful;
   more iterations are acceptable. A neutral-gray image is optional, not the
   required final master and not a reason to accept lower quality.
3. **Review the whole object.** Look for full silhouette, correct orientation,
   meaningful primary/accent regions, distinct protected materials, sufficient
   shadow detail and coherent lighting. Inspect alpha against light/dark backgrounds.
4. **Select the canonical beauty source.** Use an already approved supplied master
   when available. Otherwise show the actual candidate and identify outstanding
   creative choices for the owner. An agent may recommend a candidate and continue
   independent technical preparation, but must not invent owner approval.
5. **Freeze it.** Save exact original bytes, dimensions, color profile, hash, known
   generation inputs/tool/model, references and rights. If the external prompt or
   model is unknown, record that. Keep rejected candidates separate from the chosen
   source; no path should ambiguously mean “latest.”

Multiple AI versions may differ in geometry even if they look similar. One selected
image is authoritative for each view/revision. Do not average images, reuse masks
blindly across generated variants, or assume matching dimensions establish alignment.
Optional registration or separate packages require visual validation. A changed
master invalidates its map approval until alignment and rendering are rechecked.

Use the available image-generation workflow for creative generation. Deterministic
processing handles the runtime transforms. The provider or creative tool can change;
the delivered package must not require that provider to render player colors.

A useful generation brief skeleton (adapt it rather than copying ship details into
other categories):

```text
Target and role: <canonical object and creative interpretation>
Design identity: <silhouette/construction/material features>
View and framing: <camera, orientation, full silhouette, dimensions>
Finished quality: <approved reference and coherent materials/lighting>
Color controls: primary <surfaces>, accent <surfaces/material>; paint should
  follow manufactured parts, including appropriate edges and bevels.
Protected: <glass, machinery, functional lighting, other fixed details>
Functional emission: <only when relevant, with approved color convention>
Delivery: <alpha/background policy>; no unwanted text or baked insignia.
Preserve: <specific invariants when editing an existing object>
```

Do not promise layers or lighting passes that the image generator did not actually
return. A colored finished image can be the best source for recoloring.

## Engineer the color controls

### Define complete material selections

Primary should encompass the intended painted object, including small surrounding
faces that would otherwise stay visibly gray. Accent should read as a designed
material system. Preserve seams through their lighting/detail, not broad unpainted
borders around every panel. Protect glass, functional emissions and deliberate
machinery. Inspect whether protective masks accidentally include painted shadows.

Vector paths, image-assisted selections and segmentation proposals are all valid
authoring tools. The invariant is a **reviewed, frozen material map at runtime**.
Do not classify surfaces from whatever color the player just selected. Record the
selection method, editable guides and compiler settings so another agent can
revise it. Guide polygons alone are not proof that the final mask is correct.

Show bright debug colors, inspect source-resolution edges, and zoom into boundaries
between accent, hull, glass and mechanisms. Compare material coverage with the
approved finish. Concord's roughly 90% coverage was a finding for that design,
not a universal quota that should force paint onto another asset's glass or hardware.

### Preserve a finished material response

Keep all player edits derived from the frozen source. For the initial renderer,
use the validated linear-light appearance-transfer approach: calibrated source
swatches, material membership, an authored/compiled response map, retained source
detail, and controlled bright/dark behavior. Read the [Concord study](../../tools/ship-livery/FINISH.md)
for the actual algorithm and limits before adapting it.

Move dimensions, swatches, channel assignments, protected regions and bounded
material parameters into the package. Do not fork the color algorithm for every
ship or copy Concord's pixel coordinates into reusable code. Identify and version
renderer assumptions; authoring experiments may remain asset-specific, runtime
rendering should follow the shared package contract.

Separate material change from color change. A fixed metallic trim can change hue
while retaining its baked reflections. Claiming arbitrary chrome, roughness or
relighting requires additional validated data. Do not cover a failure with an
unlabeled new AI rendering of the requested palette.

### Place markings only where supported

If insignias are part of the skin, author named planar slots with ordered corners,
clipping masks, safe bounds, occlusion and contrast rules. Project into those
surfaces and preserve underlying shading. Check multiple emblem shapes/sizes.
Baked stripes in a master are not removable/decal-editable without an explicit
layer or removal strategy. Record capabilities honestly.

The [Concord emblem proof](../../tools/ship-livery/EMBLEMS.md) demonstrates this
with the actual game insignia component and public layered recipes. Reuse real
composition ordering, shapes and colors. Full insignia and background-free painted
layers are explicit player choices; do not silently extract only a central symbol.
Record the composition/art/renderer revisions and treatment in the bake inputs.

Players choose whether their emblem and hull colors look good together. Do not
automatically recolor, outline, simplify or reject a low-contrast combination.
A black outline may become an explicit optional treatment after implementation
and review. Inspect contrast to show the result honestly, not to impose matching.
Keep accessible identity separate from the tiny marking on a ship thumbnail.

## Inspect, revise, and decide readiness

Render meaningful adversarial choices: a representative standard palette, a light
primary, near-black, saturated pink/red/blue, matching primary/accent, and strongly
contrasting materials. Also test actual free/unlocked game swatches for the intended
catalog. Raw hex controls are useful authoring diagnostics; they are not a production
bypass for the game's named-dye entitlement rules.

For each pass:

- Inspect source, diagnostic map, full render, close crops and intended small sizes.
- Identify the visual defect specifically: incomplete coating, spill, clipped
  highlights, lost dark shape, material flatness, a frozen old color, noisy pale
  finish, distorted emblem, alpha fringe or incorrect functional emission.
- Fix the owning source: master art, mask, material response or shared renderer.
- Keep the relevant before/after evidence and rerender affected colors/states.
- Judge whether the result feels fabricated/painted in that color. Passing pixel
  invariants alone does not establish this.

The agent continues this loop within the authorized creative scope. If a necessary
choice is aesthetic, present concrete alternatives to Ethan; do not require him
to choose implementation details. If the source cannot support the desired look,
explain what information is missing and whether another authored finish pass,
better source or more involved material/geometry work would help.

Technical readiness requires:

- Immutable source binding and valid aligned map dimensions/encoding.
- Two working independent channels; protected areas and silhouette remain correct.
- Repeatable exports with input/tool/output hashes; no accumulated edit degradation.
- A documented reference-color reconstruction expectation, with tolerances where
  source normalization or color management makes exact identity inappropriate.
- Browser/offline visual parity at the intended scales; no runtime inference.
- Reviewed stress colors and owner-facing captures. If preview UI changes, capture
  and inspect desktop/mobile running implementation per repository rules.
- Relevant focused tests for the renderer/contract changed, using the test-design
  skill. Do not add expensive suites just to increase counts.

Record both **technical readiness** and **owner visual acceptance**. These can occur
at different times. Reuse existing acceptance where the approved source and scope
have not changed. A technically ready candidate with a pending art choice is a
useful handoff, not an approved canonical release.

## Package and hand off

Follow the [proposed package contract](../architecture/recolorable-asset-packages.md)
and, once W1 lands, its real schema and Make/npm commands. Current prototype commands
such as `npm run art:livery:finish` demonstrate Concord only; no generic production
CLI is claimed by this document.

Preserve authoring sources and publishable runtime files separately. Runtime maps
are generated/rebuildable artifacts, but must be included in an immutable release
bundle; ignored local output is not a distribution mechanism. All required source
files must have a durable repository/content revision before another chat starts.
Restricted sources and originals must remain outside the public repository per
ADR 002; reusable tooling/formats remain public. Do not include private repository
names, URLs or deployment details in public notes.

Use this handoff record for one skin:

```text
Target kind / canonical ID:
Collection / skin ID / immutable revision:
Owner brief and approved visual reference:
Source files, hashes, dimensions, profile, provenance and rights:
Renderer/version, material channels, reference swatches and map encoding:
Protected regions and functional emission rules:
Supported markings/finishes/views; explicitly unsupported features:
Build commands and tool versions; runtime bundle location and hash:
Visual passes, stress palettes, desktop/mobile/small-size captures:
Technical checks, failures/repairs, timings and cleanup:
Owner visual acceptance: <evidence or pending choice>
Technical readiness: <evidence or remaining work>
Catalog/integration/publication status: <separate evidence>
Next owner/chat/PR and exact blocking dependency:
```

Authoring a skin does not automatically install it, grant it, equip it, publish
content, or deploy the game. Once those actions are requested, follow their owning
content/release process using this concrete package. Self-hosters must be able to
install their own compatible packages without contacting Unbought services.
