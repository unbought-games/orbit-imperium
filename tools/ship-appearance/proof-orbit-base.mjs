// Local art review at native size, Hangar scale and a 96px shipyard thumbnail.
import { mkdir, writeFile } from 'node:fs/promises'
import sharp from 'sharp'
import { loadPackage, packageSelection } from './assets.mjs'
import { renderShipPixels } from '../../packages/ship-appearance/index.mjs'

const slug = process.argv[2]
const skin = packageSelection({}).find(({ id }) => id === 'orbit-base-' + slug)
if (!skin) throw Error('Supply the slug of a registered Orbit Base ship.')
const { id, revision } = skin
const asset = await loadPackage(id, revision)
const { width, height, reference } = asset.manifest
const output = new URL(
  `../../test-results/ship-customization/proofs/${id}/${revision}/`,
  import.meta.url,
)
await mkdir(output, { recursive: true })
const finishes = [
  ['Reference', ...reference],
  ['Hull only', '#b83535', reference[1]],
  ['Accent only', reference[0], '#367d62'],
  ['Near black', '#151723', '#a6caef'],
  ['Pale', '#f1e9df', '#234ca9'],
  ['Matching', '#8048bc', '#8048bc'],
  ['Blue and gold', '#315caa', '#d5a740'],
  ['Saturated', '#fa20a1', '#1bffa7'],
]
const panels = []
const columns = 4,
  panelWidth = 360,
  panelHeight = 304
for (const [index, [name, primary, accent]] of finishes.entries()) {
  const raw = renderShipPixels(asset, { primary, accent })
  const native = await sharp(raw, { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer()
  const filename = name.toLowerCase().replaceAll(' ', '-') + '.png'
  await writeFile(new URL(filename, output), native)
  const left = (index % columns) * panelWidth,
    top = Math.floor(index / columns) * panelHeight
  const label = Buffer.from(
    `<svg width="360" height="30"><text x="8" y="20" font-family="sans-serif" font-size="15" fill="white">${name} · ${primary} / ${accent}</text></svg>`,
  )
  panels.push({ input: label, left, top })
  panels.push({
    input: await sharp(native)
      .resize({ width: 320, height: 208, fit: 'inside' })
      .png()
      .toBuffer(),
    left: left + 14,
    top: top + 30,
  })
  panels.push({
    input: await sharp(native)
      .resize({ width: 96, height: 64, fit: 'inside' })
      .png()
      .toBuffer(),
    left: left + 14,
    top: top + 236,
  })
}
await sharp({
  create: {
    width: panelWidth * columns,
    height: panelHeight * Math.ceil(finishes.length / columns),
    channels: 3,
    background: '#1c222c',
  },
})
  .composite(panels)
  .png()
  .toFile(new URL('proof.png', output).pathname)
console.log(new URL('proof.png', output).pathname)
