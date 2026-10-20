# Astronomical atlas artwork

Original artwork made with the built-in OpenAI image-generation tool on 19 October
2026 for the screenshot-led rebuild. No game UI screenshot was cropped into an
asset. Approved SVG logos remain separate and unchanged.

`sources.json` records this family's source attribution and extraction recipes. Separate
`*-sources.json` files own contributed families. `npm run art:export` combines them,
rejects duplicate keys, and writes responsive WebP delivery files and
`manifest.json`. Sharp is a pinned development dependency; export is offline.
The manifest records source dimensions, effective extracted dimensions, SHA-256,
alpha, source attribution, crop guidance, and each delivery
file's dimensions and bytes. Native PNG masters retain their original metadata.

## Consumption

`src/ui/artwork.ts` exports:

- `resolveBodyArt({ id, kind, coordinates: { position } })`: planet slot 1–15 or
  a separate lunar variant selected deterministically by stable body ID.
- `resolvePlanetArt(position)`: for known coordinate references without a body ID.
  Invalid/unknown positions use the copper slot-4 fallback; this supplies no facts.
- `resolveCatalogArt({ kind, id })`: original object portrait for a contract key.
- `atmosphereArt`: opaque navy starfield with quiet center/right reading space.

Resolved objects contain `key`, `src`, `srcSet`, `thumbnail`, `width`, and `height`.
Supply a truthful HTML `sizes` for the layout. Use `thumbnail` for small selectors;
do not fetch or decode all large planets preemptively. Give decorative art empty
alt text when the surrounding interface already names the body/object. Reserve
dimensions and preserve useful page content when image loading fails.

Appearance is pure presentation metadata, never game state. Do not store the
resolved default on bodies or infer climate, habitability, level, production,
ownership, or eligibility from artwork. Moon variants are a separate family;
decorative moonlets do not establish playable Moon IDs.

## Framing and native resolution

Light comes from the upper right. Navy metal/shadows, champagne structure and
ice-blue details bind the family. Planet geography changes from hot inner worlds
to cold outer worlds. Complete silhouettes and genuine alpha support composition.
Generated transparent previews can show pale fringes in the chat viewer; inspect
the actual alpha composited over navy. Reviewed planet edges are clean there.

Planets/moons have native 1254px square masters, delivered at 96/320/640/1200px.
The copper planet, robotics factory, and cargo ship are native individual masters.
Building sheet objects preserve roughly 550–625px of native detail and are intended
for catalog/inspector use at up to about 300 CSS pixels at high density. Use the
native factory/cargo masters for large hero treatments. Do not enlarge tiny atlas
cells into hero objects. Export never enlarges source pixels. Derivatives add a
6% transparent inset without trimming antennas, platforms, hulls, or globe limbs.
Individual extraction rectangles preserve full objects even when a generated
sheet does not precisely obey its quadrant midlines.

The old JPEG landscape and catalog assets remain intact for existing consumers.
They were inventoried but do not match the new clean object/cutout contract.
The atlas assets and resolver support the current shell and feature composition.

Internal generation prompts, reference paths and review notes are maintained
separately. Public source records retain the generator, creation date, source
masters, extraction recipes and supplied attribution.
