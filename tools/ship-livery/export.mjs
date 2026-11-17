import sharp from 'sharp'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { renderLivery, presets } from './render.mjs'
const root = new URL('./', import.meta.url),
  art = new URL('light-fighter-v1/', root),
  out = new URL('output/', root)
await mkdir(out, { recursive: true })
const asset = JSON.parse(await readFile(new URL('asset.json', art)))
const masterBytes = await readFile(new URL(asset.master, art))
const source = await sharp(masterBytes).ensureAlpha().raw().toBuffer()
const svg = await readFile(new URL(asset.regions, art))
const mask = await sharp(svg).ensureAlpha().raw().toBuffer()
await sharp(svg).png().toFile(new URL('mask.png', out).pathname)
const files = {}
for (const [name, recipe] of Object.entries({
  ...presets,
  regions: presets.porcelain,
})) {
  const pixels = renderLivery(source, mask, asset, recipe, {
    debug: name === 'regions',
  })
  const png = await sharp(pixels, {
    raw: { width: asset.width, height: asset.height, channels: 4 },
  })
    .png()
    .toBuffer()
  await writeFile(new URL(`${name}.png`, out), png)
  files[name] = {
    sha256: createHash('sha256').update(png).digest('hex'),
    bytes: png.length,
  }
}
const plates = []
for (const [i, name] of ['porcelain', 'obsidian', 'vermilion'].entries()) {
  const ship = await sharp(new URL(`${name}.png`, out).pathname)
    .resize(1000)
    .toBuffer()
  const label = Buffer.from(
    `<svg width="1000" height="100"><text x="38" y="58" fill="#ddd6c8" font-family="Georgia" font-size="30">${presets[name].label}</text><text x="38" y="86" fill="#8b9ba9" font-family="sans-serif" font-size="14">ONE MASTER · DETERMINISTIC LIVERY ${i + 1}</text></svg>`,
  )
  plates.push(
    { input: ship, left: i * 1000, top: 100 },
    { input: label, left: i * 1000, top: 0 },
  )
}
await sharp({
  create: { width: 3000, height: 800, channels: 3, background: '#101a27' },
})
  .composite(plates)
  .png()
  .toFile(new URL('comparison.png', out).pathname)
const manifest = {
  asset: asset.id,
  assetSha256: createHash('sha256')
    .update(await readFile(new URL('asset.json', art)))
    .digest('hex'),
  recipes: presets,
  masterSha256: createHash('sha256').update(masterBytes).digest('hex'),
  maskSha256: createHash('sha256').update(svg).digest('hex'),
  rendererSha256: createHash('sha256')
    .update(await readFile(new URL('render.mjs', root)))
    .digest('hex'),
  versions: {
    node: process.version,
    sharp: sharp.versions.sharp,
    vips: sharp.versions.vips,
  },
  files,
}
await writeFile(
  new URL('manifest.json', out),
  JSON.stringify(manifest, null, 2) + '\n',
)
console.log(JSON.stringify(manifest, null, 2))
