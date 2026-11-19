// Compile the approved cannon-pod master and its artist-authored selections.
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import sharp from 'sharp'
import { linear } from '../../packages/ship-appearance/math.mjs'
import { validateManifest } from '../../packages/ship-appearance/validation.mjs'
import { compileDecalResponse } from '../ship-livery/emblem-authoring.mjs'

const study = new URL(
  '../../art/orbit-base/ships/v1/light-fighter-cannon-pods/',
  import.meta.url,
)
const id = 'orbit-base-light-fighter',
  revision = 'v1'
const out = new URL(
  '../../apps/web/public/art/ship-skins/' + id + '/' + revision + '/',
  import.meta.url,
)
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
const read = (name) => readFile(new URL(name, study))
const [master, svg, slotBytes, calibration] = await Promise.all(
  ['master.png', 'livery.svg', 'emblem-slots.json', 'paint.json'].map(read),
)
const { masterSha256, width, height, reference } = JSON.parse(calibration)
if (digest(master) !== masterSha256)
  throw Error('Authoring selections belong to a different master')
const raw = { width, height, channels: 4 }
async function rgba(bytes) {
  const { data, info } = await sharp(bytes)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  if (info.width !== width || info.height !== height)
    throw Error('Source dimensions differ from authoring selections')
  return data
}
const source = await rgba(master),
  guide = await rgba(svg)
const material = Buffer.alloc(source.length),
  response = Buffer.alloc(source.length),
  receiver = Buffer.alloc(source.length)
const lut = Array.from({ length: 256 }, (_, i) => linear(i / 255))
const swatches = reference.map((hex) =>
  Array.from(Buffer.from(hex.slice(1), 'hex'), (v) => lut[v]),
)
const limits = (value) => Math.min(1, Math.max(0, value))
// At a traced boundary, use the master's pigment to snap to the photographed
// edge. Interior glass, mechanisms and painted shadows follow the authored map.
const edges = await sharp(guide, { raw }).blur(8).raw().toBuffer()
for (let i = 0; i < source.length; i += 4) {
  if (source[i + 3] < 16) continue
  const guidePaint = Math.min(255, guide[i] + guide[i + 1])
  const nearbyPaint = edges[i] + edges[i + 1]
  const r = source[i],
    g = source[i + 1],
    b = source[i + 2]
  const chroma = (b - r) / (r + b + 1)
  let coverage = guidePaint
  if (nearbyPaint > 2 && nearbyPaint < 253) {
    const cool = limits((chroma - 0.006) / 0.032) * limits((g - 40) / 35)
    const gold = limits((-chroma - 0.082) / 0.07) * limits((g - 48) / 34)
    coverage = Math.round(255 * Math.max(cool, gold))
  }
  if (!coverage) continue
  let accent = guide[i + 1] / Math.max(guidePaint, 1)
  if (edges[i + 1] > 2 && edges[i + 1] < 253)
    accent = limits((-chroma - 0.009) / 0.105)
  material[i] = Math.round(255 * (1 - accent))
  material[i + 1] = Math.round(255 * accent)
  material[i + 3] = coverage
  let commonDiffuse = Infinity
  for (let c = 0; c < 3; c++) {
    const pigment = swatches[0][c] * (1 - accent) + swatches[1][c] * accent
    commonDiffuse = Math.min(commonDiffuse, lut[source[i + c]] / pigment)
  }
  // Bound the dye contribution by the darkest linear channel. The residual
  // retains highlights and ambient light even when the player selects black.
  const diffuse =
    0.94 * Math.min(commonDiffuse, 1 + 0.28 * Math.max(0, commonDiffuse - 1))
  response.writeUInt16BE(Math.round((Math.min(5, diffuse) * 65535) / 5), i)
  response[i + 3] = 255
  receiver[i + 3] = Math.round(coverage * (1 - accent))
}
const slots = JSON.parse(slotBytes)
const png = (bytes) => sharp(bytes, { raw }).png().toBuffer()
const decal = await compileDecalResponse(source, response, width, height)
await mkdir(out, { recursive: true })
const maps = {}
async function save(role, file, bytes) {
  await writeFile(new URL(file, out), bytes)
  maps[role] = { file, sha256: digest(bytes), bytes: bytes.length }
}
await save('source', 'source.png', master)
await save('material', 'material-mask.png', await png(material))
await save('response', 'response-map.png', await png(response))
await save('receiver', 'receiver.png', await png(receiver))
await save('decalResponse', 'decal-response.png', await png(decal))
const manifest = validateManifest({
  version: 1,
  id,
  revision,
  renderer: 'finish-decal-v1',
  target: { kind: 'Ship', id: 'LightFighter' },
  collection_id: 'orbit-standard',
  view: 'front-three-quarter-left',
  channels: ['primary', 'accent'],
  map_encoding: 'rgba8-finish-decal-v1',
  color_space: 'srgb',
  alpha: 'straight-preserved',
  capabilities: {
    treatments: ['none', 'full', 'layers'],
    placements: ['near-wing', 'paired'],
  },
  width,
  height,
  reference,
  maps,
  slots,
  paint: { opacity: 0.96, responseFloor: 0, responseCeiling: 1.5 },
  license: 'CC-BY-SA-4.0 under repository artwork scope',
  attribution: 'Orbit Imperium contributors / Unbought Games, LLC',
  provenance: {
    authoring: 'tools/ship-appearance/compile-orbit-base.mjs',
    sourceDirectory: 'art/orbit-base/ships/v1/light-fighter-cannon-pods',
    inputs: Object.fromEntries(
      [
        ['master.png', master],
        ['livery.svg', svg],
        ['emblem-slots.json', slotBytes],
        ['paint.json', calibration],
      ].map(([file, bytes]) => [file, digest(bytes)]),
    ),
    versions: { sharp: sharp.versions.sharp },
  },
})
await sharp(master)
  .resize(768)
  .webp({ lossless: true })
  .toFile(new URL('preview.webp', out).pathname)
await writeFile(
  new URL('manifest.json', out),
  JSON.stringify(manifest, null, 2) + '\n',
)
