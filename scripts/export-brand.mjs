import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import sharp from 'sharp'

// Compose the lockup and app icons from the independent SVG masters.
const sourceDir = process.argv[2]
  ? pathToFileURL(`${resolve(process.argv[2])}/`)
  : new URL('../apps/web/public/', import.meta.url)
const publicDir = process.argv[3]
  ? pathToFileURL(`${resolve(process.argv[3])}/`)
  : sourceDir
const contents = async (name) => {
  const svg = await readFile(new URL(name, sourceDir), 'utf8')
  return svg
    .replace(/^<svg[^>]*>\s*/, '')
    .replace(/\s*<\/svg>\s*$/, '')
    .replace(/<title>[^<]*<\/title>\s*/, '')
}
const logo = await contents('brand-mark.svg')
const wordmark = await contents('brand-wordmark.svg')
for (const [name, size] of [
  ['favicon.svg', 64],
  ['icon.svg', 1024],
]) {
  await writeFile(
    new URL(name, publicDir),
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">
  <title>Orbit Imperium</title>
  <rect width="64" height="64" rx="12" fill="#0d1827"/>
  <g transform="translate(4.8 4.8) scale(.85)">
${logo}
  </g>
</svg>
`,
  )
}
// Render each favicon at its native size and package the same PNGs in the ICO.
const favicon = await readFile(new URL('favicon.svg', publicDir))
const sizes = [16, 32, 48]
const frames = []
const directory = Buffer.alloc(6 + sizes.length * 16)
directory.writeUInt16LE(1, 2)
directory.writeUInt16LE(sizes.length, 4)
let offset = directory.length
for (const [index, size] of sizes.entries()) {
  const png = await sharp(favicon).resize(size, size).png().toBuffer()
  await writeFile(new URL(`favicon-${size}.png`, publicDir), png)
  const entry = 6 + index * 16
  directory[entry] = size
  directory[entry + 1] = size
  directory.writeUInt16LE(1, entry + 4)
  directory.writeUInt16LE(32, entry + 6)
  directory.writeUInt32LE(png.length, entry + 8)
  directory.writeUInt32LE(offset, entry + 12)
  frames.push(png)
  offset += png.length
}
await writeFile(new URL('favicon.ico', publicDir), Buffer.concat([directory, ...frames]))
// Render home-screen assets from the padded SVG; iOS supplies its own mask.
const appIcon = await readFile(new URL('icon.svg', publicDir))
await sharp(appIcon)
  .png()
  .toFile(fileURLToPath(new URL('icon-1024.png', publicDir)))
await sharp(appIcon)
  .resize(180, 180)
  .flatten({ background: '#0d1827' })
  .png()
  .toFile(fileURLToPath(new URL('apple-touch-icon.png', publicDir)))
await writeFile(
  new URL('brand-lockup.svg', publicDir),
  `<svg xmlns="http://www.w3.org/2000/svg" width="270" height="64" viewBox="0 0 270 64">
  <title>Orbit Imperium logo and wordmark</title>
  <g transform="translate(0 6) scale(.8125)">
${logo}
  </g>
  <g transform="translate(68 18)">
${wordmark}
  </g>
</svg>
`,
)
