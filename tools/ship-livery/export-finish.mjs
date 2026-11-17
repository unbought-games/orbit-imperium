import sharp from 'sharp'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { renderFinish, finishPresets } from './finish-render.mjs'
import { compileResponse } from './finish-authoring.mjs'
import { renderLivery } from './render.mjs'
const root = new URL('./', import.meta.url),
  art = new URL('concord-finish-v2/', root),
  out = new URL('output/finish/', root)
await mkdir(out, { recursive: true })
const metadata = JSON.parse(await readFile(new URL('asset.json', art)))
for (const expected of metadata.sources) {
  const hash = createHash('sha256')
    .update(await readFile(new URL(expected.path, root)))
    .digest('hex')
  if (hash !== expected.sha256)
    throw Error('Master changed: review material selection before exporting')
}
const gray = await sharp(new URL('concord-v1/master.png', root).pathname)
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
  await readFile(new URL('concord-v1/panels.svg', root)),
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
await save('geometry-mask', geometry)
await save('previous-mask', oldMask)
const responseMap = compileResponse(finished, mask)
await save('response-map', responseMap)
const hashes = {}
for (const [id, recipe] of Object.entries(finishPresets)) {
  hashes[id] = await save(
    id,
    renderFinish(finished, mask, recipe, { responseMap }),
  )
  await save(
    'gray-' + id,
    renderFinish(gray, mask, recipe, { mode: 'gray', stage: 2 }),
  )
}
await save(
  'pass1-coverage',
  renderFinish(gray, geometry, finishPresets.navy, { mode: 'gray', stage: 1 }),
)
await save(
  'pass2-gray-material',
  renderFinish(gray, mask, finishPresets.navy, { mode: 'gray', stage: 2 }),
)
const oldAsset = JSON.parse(
  await readFile(new URL('concord-v1/asset.json', root)),
)
for (const key of ['navy', 'rose'])
  await save(
    'previous-' + key,
    renderLivery(gray, oldMask, oldAsset, {
      ...finishPresets[key],
      pattern: 'solid',
      emblem: 'none',
      finish: 'satin',
    }),
  )
const debug = Buffer.from(finished)
for (let p = 0; p < mask.length; p += 4) {
  const w = mask[p + 3] / 255
  for (let c = 0; c < 3; c++)
    debug[p + c] = Math.round(finished[p + c] * (1 - w) + mask[p + c] * w)
}
await save('mask-debug', debug)
const label = (text, width) =>
  Buffer.from(
    `<svg width="${width}" height="80"><text x="24" y="34" font-family="Georgia" font-size="25" fill="#eee0c9">${text}</text><text x="24" y="62" font-family="sans-serif" font-size="13" fill="#9aafc0">CONCORD · FIXED CAMERA · DETERMINISTIC COLOR</text></svg>`,
  )
const board = []
for (const [row, key] of ['navy', 'rose'].entries())
  for (const [column, prefix, title] of [
    [0, 'previous-', 'Previous partial masks'],
    [1, 'gray-', 'Original gray master · full coating'],
    [2, '', 'Finished master · local recolor'],
  ]) {
    board.push(
      { input: label(title, 1024), left: column * 1024, top: row * 790 },
      {
        input: await sharp(new URL(prefix + key + '.png', out).pathname)
          .resize(1024)
          .toBuffer(),
        left: column * 1024,
        top: row * 790 + 80,
      },
    )
  }
await sharp({
  create: { width: 3072, height: 1580, channels: 3, background: '#101a27' },
})
  .composite(board)
  .png()
  .toFile(new URL('progression.png', out).pathname)
const paletteBoard = []
for (const [i, [key, preset]] of Object.entries(finishPresets).entries()) {
  const left = (i % 3) * 900,
    top = Math.floor(i / 3) * 700
  paletteBoard.push(
    { input: label(preset.label, 900), left, top },
    {
      input: await sharp(new URL(key + '.png', out).pathname)
        .resize(900)
        .toBuffer(),
      left,
      top: top + 80,
    },
  )
}
await sharp({
  create: { width: 2700, height: 1400, channels: 3, background: '#101a27' },
})
  .composite(paletteBoard)
  .png()
  .toFile(new URL('palettes.png', out).pathname)
for (const name of [
  'material-mask',
  'response-map',
  'previous-mask',
  'geometry-mask',
  'mask-debug',
  'pass1-coverage',
  'pass2-gray-material',
  'progression',
  'palettes',
  ...Object.keys(finishPresets).map((k) => 'gray-' + k),
])
  hashes[name] = createHash('sha256')
    .update(await readFile(new URL(name + '.png', out)))
    .digest('hex')
await writeFile(
  new URL('manifest.json', out),
  JSON.stringify(
    {
      inputs: await Promise.all(
        [
          'concord-v1/master.png',
          'concord-v1/panels.svg',
          'concord-finish-v2/asset.json',
          'concord-finish-v2/finished-master.png',
          'concord-finish-v2/protected.svg',
          'finish-render.mjs',
          'finish-authoring.mjs',
          'export-finish.mjs',
        ].map(async (path) => ({
          path,
          sha256: createHash('sha256')
            .update(await readFile(new URL(path, root)))
            .digest('hex'),
        })),
      ),
      recipes: finishPresets,
      versions: { node: process.version, sharp: sharp.versions.sharp },
      hashes,
    },
    null,
    2,
  ) + '\n',
)
console.log(
  'Exported coverage, gray-material and finished-master passes plus six palettes',
)
