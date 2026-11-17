// Offline trusted authoring only. Keep accepted source selection math unchanged.
import sharp from 'sharp'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { compileResponse } from '../ship-livery/finish-authoring.mjs'
import { compileDecalResponse } from '../ship-livery/emblem-authoring.mjs'
const study = new URL('../ship-livery/', import.meta.url)
const art = new URL('concord-finish-v2/', study)
const out = new URL(
  '../../apps/web/public/art/ship-skins/orbit-light-fighter/concord-v1/',
  import.meta.url,
)
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
await mkdir(out, { recursive: true })
const metadata = JSON.parse(await readFile(new URL('asset.json', art)))
for (const source of metadata.sources) {
  if (digest(await readFile(new URL(source.path, study))) !== source.sha256)
    throw Error('Source changed: reauthor package')
}
const gray = await sharp(new URL('concord-v1/master.png', study).pathname)
  .ensureAlpha()
  .raw()
  .toBuffer()
const finished = await sharp(new URL('finished-master.png', art).pathname)
  .ensureAlpha()
  .raw()
  .toBuffer()
const protectedMask = await sharp(await readFile(new URL('protected.svg', art)))
  .ensureAlpha()
  .raw()
  .toBuffer()
const protectedSvg = await readFile(new URL('protected.svg', art), 'utf8')
const canopySvg = protectedSvg.replace(/<path(?! id="canopy")[\s\S]*?\/>/g, '')
const canopyMask = await sharp(Buffer.from(canopySvg))
  .ensureAlpha()
  .raw()
  .toBuffer()
const oldMask = await sharp(
  await readFile(new URL('concord-v1/panels.svg', study)),
)
  .ensureAlpha()
  .raw()
  .toBuffer()
// Compile and freeze reviewed semantic selections from the approved finish reference.
// Color discrimination is authoring assistance only; the renderer consumes the saved mask.
const mask = Buffer.alloc(finished.length),
  geometry = Buffer.alloc(finished.length)
for (let p = 0; p < mask.length; p += 4) {
  // Coarse vent polygons are selection guides, not permission to freeze surrounding armor.
  // Intersect with dark structure in the neutral master; retain reflective glass separately.
  const dark = Math.max(
    0,
    Math.min(1, (112 - (gray[p] + gray[p + 1] + gray[p + 2]) / 3) / 24),
  )
  const blueChroma =
    (finished[p + 2] - finished[p]) / (finished[p + 2] + finished[p] + 1)
  const neutral = 1 - Math.max(0, Math.min(1, (blueChroma - 0.1) / 0.1))
  let protection = Math.max(
    canopyMask[p + 3],
    protectedMask[p + 3] * dark * neutral,
  )
  const x = (p / 4) % 1536,
    y = Math.floor(p / 4 / 1536)
  if (
    ((x > 595 && x < 730 && y > 231 && y < 294) ||
      (x > 1180 && x < 1315 && y > 298 && y < 388)) &&
    finished[p] > finished[p + 1] * 1.2 &&
    finished[p] > finished[p + 2] * 2
  )
    protection = 255
  const coverage = 255 - Math.round(protection)
  const r = finished[p],
    b = finished[p + 2]
  const gold = Math.max(0, Math.min(1, ((r - b) / (r + b + 1) + 0.04) / 0.23))
  mask[p] = Math.round(255 * (1 - gold))
  mask[p + 1] = Math.round(255 * gold)
  mask[p + 3] = finished[p + 3] >= 16 ? coverage : 0
  geometry[p] = 255 - oldMask[p + 1]
  geometry[p + 1] = oldMask[p + 1]
  geometry[p + 3] = gray[p + 3] >= 16 ? coverage : 0
}
const save = async (name, pixels) => {
  const bytes = await sharp(pixels, {
    raw: { width: 1536, height: 1024, channels: 4 },
  })
    .png()
    .toBuffer()
  await writeFile(new URL(name + '.png', out), bytes)
  return createHash('sha256').update(bytes).digest('hex')
}
await save('material-mask', mask)
const responseMap = compileResponse(finished, mask)
await save('response-map', responseMap)

const config = JSON.parse(
  await readFile(new URL('concord-emblems-v1/slots.json', study)),
)
const sourceBytes = await readFile(new URL('finished-master.png', art))
if (digest(sourceBytes) !== config.masterSha256)
  throw Error('Slot/master mismatch')
await writeFile(new URL('source.png', out), sourceBytes)
const response = await compileDecalResponse(
  finished,
  responseMap,
  config.width,
  config.height,
)
await save('decal-response', response)
const receiver = await sharp(
  await readFile(new URL('concord-emblems-v1/receiver.svg', study)),
)
  .ensureAlpha()
  .raw()
  .toBuffer()
for (let p = 0; p < receiver.length; p += 4)
  receiver[p + 3] = Math.round(
    (((receiver[p] / 255) * receiver[p + 3] * mask[p + 3]) / 255) *
      (1 - mask[p + 1] / 255),
  )
await save('receiver', receiver)
await sharp(sourceBytes)
  .resize(768)
  .webp({ lossless: true })
  .toFile(new URL('preview.webp', out).pathname)
const maps = {}
for (const [key, file] of Object.entries({
  source: 'source.png',
  material: 'material-mask.png',
  response: 'response-map.png',
  receiver: 'receiver.png',
  decalResponse: 'decal-response.png',
})) {
  const bytes = await readFile(new URL(file, out))
  maps[key] = { file, sha256: digest(bytes), bytes: bytes.length }
}
const manifest = {
  version: 1,
  id: 'orbit-light-fighter',
  revision: 'concord-v1',
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
  width: config.width,
  height: config.height,
  reference: ['#1e2e40', '#cf9c48'],
  maps,
  slots: config.slots,
  paint: config.paint,
  license: metadata.license,
  attribution: metadata.attribution,
  provenance: {
    sources: metadata.sources,
    rendererInputs: await Promise.all(
      [
        '../../packages/ship-appearance/finish.mjs',
        '../../packages/ship-appearance/emblem.mjs',
        '../../packages/ship-appearance/math.mjs',
        '../../packages/ship-appearance/static-insignia.tsx',
        '../../apps/web/src/features/empire-insignia.tsx',
        '../../apps/web/src/features/insignia.module.css',
        '../../apps/web/src/features/rewards/cosmetic-treatment.tsx',
        '../../apps/web/src/features/rewards/cosmetic-treatment.module.css',
        '../../apps/web/src/client-model/cosmetic-treatment.ts',
        '../ship-livery/finish-authoring.mjs',
        '../ship-livery/emblem-authoring.mjs',
        './compile.mjs',
      ].map(async (path) => ({
        path: new URL(path, import.meta.url).pathname.slice(
          new URL('../../', import.meta.url).pathname.length,
        ),
        sha256: digest(await readFile(new URL(path, import.meta.url))),
      })),
    ),
    versions: { node: process.version, sharp: sharp.versions.sharp },
    finish: metadata.sourceOfFinish,
    authoring:
      'tools/ship-appearance/compile.mjs; accepted Concord finish and EMBLEMS proof',
  },
}
await writeFile(
  new URL('manifest.json', out),
  JSON.stringify(manifest, null, 2) + '\n',
)
console.log(
  'Compiled orbit-light-fighter/concord-v1 from hash-verified accepted sources',
)
