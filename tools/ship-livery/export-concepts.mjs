import sharp from 'sharp'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { renderLivery } from './render.mjs'
import { concepts, conceptPresets } from './concepts.mjs'
const root = new URL('./', import.meta.url),
  out = new URL('output/concepts/', root)
await mkdir(out, { recursive: true })
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')
const summary = []
const board = []
for (const [row, concept] of concepts.entries()) {
  const art = new URL(concept.id + '/', root),
    dir = new URL(concept.id + '/', out)
  await mkdir(dir, { recursive: true })
  const json = await readFile(new URL('asset.json', art)),
    asset = JSON.parse(json)
  const master = await readFile(new URL(asset.master, art)),
    svg = await readFile(new URL(asset.regions, art))
  if (sha(master) !== asset.masterSha256)
    throw Error('Master changed: review and re-author masks before exporting')
  const { data: source, info } = await sharp(master)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  if (info.width !== asset.width || info.height !== asset.height)
    throw Error('Master dimensions disagree with metadata')
  const mask = await sharp(svg).ensureAlpha().raw().toBuffer()
  await sharp(svg).png().toFile(new URL('mask.png', dir).pathname)
  const coverage = [0, 0]
  let hullPixels = 0
  for (let p = 0; p < source.length; p += 4) {
    if (source[p + 3] > 127) {
      hullPixels++
      for (let g = 0; g < 2; g++)
        coverage[g] += (mask[p + g] * mask[p + 3]) / 65025
    }
  }
  const files = {}
  for (const [name, recipe] of Object.entries({
    ...conceptPresets,
    regions: conceptPresets.graphite,
  })) {
    const rendered = renderLivery(source, mask, asset, recipe, {
      debug: name === 'regions',
    })
    const png = await sharp(rendered, {
      raw: { width: asset.width, height: asset.height, channels: 4 },
    })
      .png()
      .toBuffer()
    await writeFile(new URL(name + '.png', dir), png)
    files[name] = { sha256: sha(png), bytes: png.length }
  }
  for (const [column, key] of Object.keys(conceptPresets).entries()) {
    const ship = await sharp(new URL(key + '.png', dir).pathname)
      .resize(900)
      .toBuffer()
    const label = Buffer.from(
      `<svg width="900" height="90"><text x="28" y="40" fill="#eee4d5" font-family="Georgia" font-size="29">${concept.name}</text><text x="28" y="70" fill="#9cafbd" font-family="sans-serif" font-size="15">${conceptPresets[key].label} · PRIMARY + ACCENT</text></svg>`,
    )
    board.push(
      { input: label, left: column * 900, top: row * 710 },
      { input: ship, left: column * 900, top: row * 710 + 90 },
    )
  }
  const record = {
    id: concept.id,
    masterSha256: sha(master),
    metadataSha256: sha(json),
    maskSha256: sha(svg),
    rendererSha256: sha(await readFile(new URL('render.mjs', root))),
    presets: conceptPresets,
    versions: {
      node: process.version,
      sharp: sharp.versions.sharp,
      vips: sharp.versions.vips,
    },
    paintCoverage: coverage.map((v) => Number((v / hullPixels).toFixed(4))),
    files,
  }
  await writeFile(
    new URL('manifest.json', dir),
    JSON.stringify(record, null, 2) + '\n',
  )
  summary.push(record)
}
await sharp({
  create: { width: 2700, height: 1420, channels: 3, background: '#101a27' },
})
  .composite(board)
  .png()
  .toFile(new URL('comparison.png', out).pathname)
await writeFile(
  new URL('manifest.json', out),
  JSON.stringify(summary, null, 2) + '\n',
)
console.log(summary.map(({ id, paintCoverage }) => ({ id, paintCoverage })))
