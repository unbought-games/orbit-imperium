# Recolorable asset package contract

> Implementation is now underway. [The approved first-slice contract](../plans/asset-customization/IMPLEMENTATION.md)
> supersedes older proposals below, especially shared bake keys and pinned emblems.

Status: **proposed v1**, 2026-11-16. This defines the W1/W2 agreement to implement;
it is not an existing JSON schema or catalog-reader version. See the
[delivery plan](../plans/asset-customization/README.md) and
[authoring guide](../operations/recolorable-asset-authoring.md).

## Identity and capabilities

A package describes one authored skin revision for one compatible target and fixed
view. Target identity is `{kind, id}` using the real catalog IDs (initially Ship,
Defense or Building). `skinId` is independent of the target: several skins may
serve LightFighter. `collectionId` groups related skins and does not change rules.
An immutable package revision identifies exact image, maps and rendering semantics.

Keep package format version, renderer version, catalog reader/negotiation version,
content revision, and player's design revision distinct. A format-version increment
is not a new cosmetic unlock. A new content revision must not silently change the
meaning of a saved design or historical image reference.

Capabilities are explicit. V1 requires primary and accent channels plus protected
content, a fixed view and a defined default appearance. Optional slots, patterns,
finish variants or emission profiles are advertised only when authored and supported
by the installed trusted renderer. No schema implies free rotation or arbitrary
material replacement. Research art can stay a static asset.

## Proposed package contents

| Field/artifact                                                  | Contract                                                                                                                                                          |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `formatVersion`, `skinId`, `collectionId`, `target`, `revision` | Validated stable identities; revision bound to exact content; target compatibility checked on save/equip                                                          |
| Source/beauty image                                             | Immutable file hash, width/height, alpha/background contract and color profile; the chosen finished master is authoritative                                       |
| Channel definitions                                             | Stable `primary`/`accent` IDs, labels, material roles and calibrated reference swatches; protected regions are not user-selectable colors                         |
| Material map                                                    | Exact coordinate system/alignment, channel encoding, overlap/coverage semantics, resampling rules and hash                                                        |
| Response/detail maps                                            | Explicit encodings, numeric ranges and hashes; no assumption that all image channels represent display RGB                                                        |
| Renderer descriptor                                             | Allowlisted compiled renderer ID/version with bounded data parameters; no uploaded shaders, JavaScript, CSS or executable expressions                             |
| View/framing                                                    | Native image coordinates, full silhouette bounds, display aspect ratio, insets and preview sizing; not hardcoded to Concord's dimensions                          |
| Default recipe                                                  | References known free dyes or a package default compatible with the deployment's color policy; renderer source calibration remains separate from gameplay unlocks |
| Optional marking slots                                          | Stable slot ID, ordered quadrilateral, clipping/occlusion, safe sizing and declared layer/contrast policy                                                         |
| Functional emission                                             | Protected fixed color/profile or explicitly supported data-driven variant; driven by approved game/art policy, never arbitrary player paint                       |
| Provenance/license                                              | Known author/generation source, rights, attribution, dates and approval evidence; unknown provenance is recorded honestly                                         |
| Runtime variants                                                | Compatible dimensions/formats, hashes and map alignment; lossless data maps, suitable beauty/thumbnail encoding                                                   |

An illustrative identity fragment, not a loadable completed package:

```json
{
  "formatVersion": 1,
  "skinId": "orbit-light-fighter",
  "collectionId": "orbit-standard",
  "target": { "kind": "Ship", "id": "LightFighter" },
  "view": "front-three-quarter-left",
  "channels": ["primary", "accent"]
}
```

W1 supplies the actual machine-readable schema, validation, byte/dimension limits,
renderer parameters and test fixtures. Stable IDs above are proposals until the
contract is frozen. Do not ship a partial fragment as an accepted manifest.

The Concord response-map prototype packs one 16-bit scalar across R/G bytes in a
PNG. That is numerical data, not ordinary RGB art: lossy compression, color-profile
conversion, interpolation of packed bytes, or premultiplied-alpha changes can
corrupt it. V1 must specify decode-before-filter semantics and lossless transport
(or choose a better documented encoding). All maps must remain registered with
beauty variants. Preserve authored originals even if the runtime beauty uses WebP.

## Authoring input versus runtime package

Authoring input includes chosen masters, optional neutral/calibration references,
editable selection guides, compiler settings and review evidence. Runtime needs
only the approved beauty, compiled masks/response data, parameters and supported
placements. It performs no segmentation, image generation or discovery of surfaces
from the player's selected color. A runtime palette change has no provider dependency.

Multiple generated references assist authoring; they are not automatically aligned
runtime layers. Bind every compiled artifact to its inputs and fail build on changed
source hashes. Produce a manifest with tool/renderer versions and output hashes.
Generated maps are derived build artifacts, not player/game state. They may be
stored/distributed in immutable bundles and rebuilt from their recorded inputs.

## Recipe and equipment contract

A player's authored recipe stores the skin/package reference and selected dye IDs,
plus supported authored placement references when enabled. Official new edits use
named dyes from the existing catalog. The server—not the client—resolves access.
Do not persist resolved colors, URLs or effective fallback copies as truth.

A library design belongs to the local account and is reusable across universes.
The agreed equipment scope is independent per empire/universe and target; the
proposed key is `(empire, target kind, target ID)`. Ownership and
compatible-target constraints belong in server/DB boundaries. Equipment points to
a design revision or generated appearance, not copied image/color state. Saved designs have immutable recipe revisions. An edit/equip in the current
universe must not change equipment in another universe; other equipment keeps
its pinned revision. W2 still defines concrete API and transaction semantics.

Keep authored and generated appearances as a closed union:

```text
Authored: skin/package revision + valid named-dye recipe [+ supported placements]
Generated: immutable owned media revision bound to its target
```

A generated result cannot be passed to the authored renderer with guessed masks.
The renderer sees resolved colors; catalog/access policy belongs in a higher layer.
The game engine never consumes the image or package to determine mechanics.

## Emblem placement and immutable bakes

The [Concord proof](../../tools/ship-livery/EMBLEMS.md) demonstrates real static
insignia rendering, full-badge and explicit background-free treatments, two planar
wing slots, clipping and fixed surface lighting/detail. This is local prototype
support; the production schema, adapter and storage are not implemented.

Extend the package with ordered named slot quads, source binding, frozen receiver
and decal-response maps, permitted treatments and bounded paint parameters.
A saved recipe references an immutable insignia composition/art revision and
explicit placement/treatment. Preserve its shape, layer order and selected colors.
Players own palette matching; no automatic contrast recoloring or outline. Any
future outline is an explicit pixel-affecting recipe option.

Saved revisions have transparent baked images and size variants. Share a bake for
identical pixel inputs; account, empire and universe are not part of its identity.
Include package/master/map and renderer versions, hull colors, emblem recipe and
resolved colors, shape/layer ordering, symbol-art and composition-renderer revisions,
treatment, placement/geometry, paint settings, output size/format and color/alpha
policy. The immutable recipe remains authoritative; bakes are reproducible output,
not duplicated ownership or availability state. Account/empire authorization stays
in the library/equipment/delivery layer even when the underlying bytes are shared.

An insignia edit does not silently rewrite a saved ship's immutable composition
snapshot or historical bake. Static support for animated/interactive insignia
finishes remains an explicit unresolved policy, not a captured random animation
frame. The proof uses no such treatments.

## Access, delivery and fallback

Preserve ADR 002: public originals are free; restricted originals and authoring
sources are distributed separately. Unrestricted policy unlocks installed content
only. New skin payloads require deliberate reader negotiation; existing strict
insignia/treatment schemas are not already a skin-package transport.

Preserve chosen skin/dyes/equipment and permanent grants when access or content is
missing. Derive a known free appearance with the same target. A viewer sees the
owner's effective appearance under existing disclosure rules, not a fallback based
on the viewer's own dye ownership. Failed image delivery never blocks gameplay.
Unknown renderer versions, missing/corrupt maps, dimension mismatch, incompatible
targets or unsupported capabilities fail validation or take a documented fallback;
never silently apply the wrong masks to a different master.

Keep generated player media in a separate owned/untrusted-media namespace and
lifecycle; never put it into trusted catalog originals. Player generation is
server-produced media but still needs input/output validation and visibility policy.

## Runtime integration and performance

Provide one owner-aware appearance resolver and one renderer implementation.
Consumers pass target, owner/empire context and any event-time reference, rather
than looking up a globally selected skin. Current Shipyard/inventory displays and
historical reports have different identity/time semantics.

Load high-resolution maps only for relevant previews. Normal catalog lists and
fleet rows should use appropriate-size derived thumbnails with a bounded cache,
not rerender every large texture continuously. Any cache key includes package and
renderer revisions, resolved authorized recipe, placement inputs and output size.
A cache miss/deletion must not erase selection or ownership; cached art is never
entitlement evidence. Install/version changes invalidate by key, not mutation of
an existing immutable object.

Measure download/decode, first render, palette update, memory and low-end/mobile
interaction before claiming readiness. The existing 75–92 ms desktop prototype
is evidence, not a production performance target. Consider a worker or shader
when measured input responsiveness warrants it; keep reference output and CPU/GPU
parity checks. Do not create a scheduler/resource registry for this feature.

## Validation and publication boundary

W1 validates source binding, dimensions, bounded map parameters, channel integrity,
repeatability, protected emission/glass, alpha, channel independence, stress colors
and corruption rejection. Use independent freely licensed fixtures, including a
second geometry/aspect ratio so a Concord-only implementation cannot pass as generic.
W2 validates ownership/access/revisions/retention and delivery; W3/W4 validate the
actual interaction and in-game appearance. Follow the test-design and UI skills.

Runtime color output need not be byte-identical across arbitrary browsers. Record
the tolerance and color-management contract; demonstrate visually equivalent output
and stable protected regions. Exact reference reconstruction is valuable when the
renderer claims it; do not fabricate that expectation for a differently normalized
source. Visual approval remains independent from numeric invariants.

Publishing a compatible content bundle, activating a catalog revision, and deploying
new renderer code are separate actions. Roll out compatible readers before catalog
activation, retain prior revisions for rollback/history, and never delete saved
choices to simplify a rollback. A self-hosted installation must be able to use local
files or its own storage without official account services.
