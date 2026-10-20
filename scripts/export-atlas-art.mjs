import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises'
import sharp from 'sharp'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

// Offline derivation only. Never generates art or changes a source master.
const root = new URL('../apps/web/public/art/atlas/', import.meta.url)
const source = JSON.parse(await readFile(new URL('sources.json', root), 'utf8'))
// Family contributors own separate fragments; merge their metadata only here.
for (const name of (await readdir(root))
  .filter((name) => name.endsWith('-sources.json'))
  .sort()) {
  const fragment = JSON.parse(await readFile(new URL(name, root), 'utf8'))
  source.assets.push(
    ...fragment.assets.map((asset) => ({ ...asset, sourceFragment: name })),
  )
}
const keys = new Set()
for (const asset of source.assets) {
  if (keys.has(asset.key)) throw Error(`Duplicate artwork key: ${asset.key}`)
  keys.add(asset.key)
}
const manifest = { ...source, assets: [] }
for (const asset of source.assets) {
  const master = fileURLToPath(new URL(asset.master, root))
  const metadata = await sharp(master).metadata()
  const sha256 = createHash('sha256')
    .update(await readFile(master))
    .digest('hex')
  let input = sharp(master)
  if (asset.extract) input = input.extract(asset.extract)
  const cutout = await input.png().toBuffer()
  const variants = []
  for (const width of asset.sizes) {
    const path = `${asset.key}-${width}.webp`
    await mkdir(new URL(path.split('/').slice(0, -1).join('/') || '.', root), {
      recursive: true,
    })
    const height =
      asset.key === 'atmosphere' ? Math.round((width * 5) / 8) : width
    // Transparent inset provides consistent framing without trimming a silhouette.
    const inset = asset.key === 'atmosphere' ? 0 : Math.round(width * 0.06)
    const resized = await sharp(cutout)
      .resize(width - 2 * inset, height - 2 * inset, {
        fit: 'contain',
        background: '#00000000',
        withoutEnlargement: true,
      })
      .toBuffer()
    let output = sharp({
      create: {
        width,
        height,
        channels: 4,
        background: asset.key === 'atmosphere' ? '#0d1827' : '#00000000',
      },
    }).composite([{ input: resized, gravity: 'centre' }])
    if (asset.key === 'atmosphere') output = output.removeAlpha()
    const info = await output
      .webp({ quality: width <= 96 ? 88 : 84, alphaQuality: 100, effort: 4 })
      .toFile(new URL(path, root).pathname)
    variants.push({
      path,
      width,
      height,
      bytes: info.size,
      alpha: asset.key !== 'atmosphere',
    })
  }
  manifest.assets.push({
    ...asset,
    sha256,
    effectiveSourceDimensions: asset.extract
      ? { width: asset.extract.width, height: asset.extract.height }
      : { width: metadata.width, height: metadata.height },
    dimensions: { width: metadata.width, height: metadata.height },
    alpha: metadata.hasAlpha,
    variants,
  })
}
await writeFile(
  new URL('manifest.json', root),
  `${JSON.stringify(manifest, null, 2)}\n`,
)
console.log(
  `Exported ${manifest.assets.length} original artworks with responsive derivatives.`,
)
