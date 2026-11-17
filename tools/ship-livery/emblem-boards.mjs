import sharp from 'sharp'
import { readFile } from 'node:fs/promises'
const out = new URL('output/emblems/', import.meta.url)
const label = (text, w = 768) =>
  Buffer.from(
    `<svg width="${w}" height="55"><text x="20" y="34" fill="#e9dfca" font-family="sans-serif" font-size="19">${text}</text></svg>`,
  )
async function board(name, cells, columns, width = 768, height = 570) {
  const parts = []
  for (let i = 0; i < cells.length; i++) {
    const [file, title] = cells[i],
      left = (i % columns) * width,
      top = Math.floor(i / columns) * height
    parts.push({ input: label(title, width), left, top })
    parts.push({
      input: await sharp(new URL(file + '.png', out).pathname)
        .resize(width, height - 55, { fit: 'contain', background: '#101a27' })
        .toBuffer(),
      left,
      top: top + 55,
    })
  }
  await sharp({
    create: {
      width: width * columns,
      height: Math.ceil(cells.length / columns) * height,
      channels: 3,
      background: '#101a27',
    },
  })
    .composite(parts)
    .png()
    .toFile(new URL(name + '.png', out).pathname)
}
await board(
  'treatments',
  [
    ['crown-navy-full-paired', 'Crowned Wayfinder · full insignia'],
    ['crown-navy-layers-paired', 'Crowned Wayfinder · painted layers'],
    ['helix-rose-full-paired', 'Ringed planet · full insignia'],
    ['helix-rose-layers-paired', 'Ringed planet · painted layers'],
    ['starwing-pearl-full-paired', 'Starwing · full insignia'],
    ['starwing-pearl-layers-paired', 'Starwing · painted layers'],
    ['ascendant-midnight-full-paired', 'Ascendant · full insignia'],
    ['ascendant-midnight-layers-paired', 'Ascendant · painted layers'],
  ],
  2,
)
await board(
  'size-placement',
  [
    ['size-0.75', '75% · discreet'],
    ['crown-navy-layers-paired', '100% · recommended'],
    ['size-1.25', '125% · larger marking'],
    ['crown-navy-layers-single', 'Near wing only'],
  ],
  2,
)
const crops = []
for (const [i, name] of [
  'flat-comparison',
  'response-only-comparison',
  'crown-navy-layers-paired',
  'helix-rose-full-paired',
  'starwing-pearl-full-paired',
  'ascendant-midnight-layers-paired',
].entries()) {
  const filename = 'crop-' + i
  await sharp(new URL(name + '.png', out).pathname)
    .extract({ left: 890, top: 395, width: 365, height: 230 })
    .resize(1095, 690)
    .png()
    .toFile(new URL(filename + '.png', out).pathname)
  crops.push([
    filename,
    [
      'Flat overlay',
      'Lighting only',
      'Lighting + source surface detail',
      'Layered full badge on rose',
      'Roundel on porcelain',
      'Transparent diamond composition',
    ][i],
  ])
}
await board('surface-closeups', crops, 3, 1095, 750)
const textures = []
for (const id of ['crown', 'starwing', 'helix', 'ascendant'])
  for (const mode of ['full', 'layers'])
    textures.push([id + '-' + mode, id + ' · ' + mode])
await board('original-insignias', textures, 4, 300, 390)
const config = JSON.parse(
  await readFile(new URL('concord-emblems-v1/slots.json', import.meta.url)),
)
const overlay = Buffer.from(
  `<svg width="1536" height="1024">${config.slots.map((s) => `<polygon points="${s.quad.map((p) => p.join(',')).join(' ')}" fill="#22ffad33" stroke="#55ffbd" stroke-width="3"/><text x="${s.quad[0][0]}" y="${s.quad[0][1] - 12}" fill="white" font-family="sans-serif" font-size="20">${s.id}</text>`).join('')}</svg>`,
)
await sharp(
  new URL('concord-finish-v2/finished-master.png', import.meta.url).pathname,
)
  .composite([{ input: overlay }])
  .png()
  .toFile(new URL('placement-guide.png', out).pathname)
console.log('Review boards exported')

await board(
  'recommended',
  [
    ['crown-navy-layers-paired', 'Navy · Crowned Wayfinder'],
    ['helix-rose-layers-paired', 'Rose · Ringed planet'],
    ['starwing-pearl-layers-paired', 'Porcelain · Starwing'],
    ['ascendant-midnight-layers-paired', 'Obsidian · Ascendant'],
  ],
  2,
)
await board(
  'contrast',
  ['navy', 'rose', 'pearl', 'midnight'].flatMap((p) =>
    ['full', 'layers'].map((t) => [`crown-${p}-${t}-paired`, `${p} · ${t}`]),
  ),
  2,
)
// Real transparent delivery-size examples, not screenshots of a scaled UI.
for (const name of [
  'crown-navy-layers-paired',
  'helix-rose-layers-paired',
  'starwing-pearl-layers-paired',
  'ascendant-midnight-layers-paired',
])
  for (const width of [80, 160, 320, 768])
    await sharp(new URL(name + '.png', out).pathname)
      .resize(width)
      .png()
      .toFile(new URL(name + `-${width}.png`, out).pathname)
