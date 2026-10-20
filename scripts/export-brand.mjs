import { readFile, writeFile } from 'node:fs/promises'

// Compose the lockup and app icons from the independent SVG masters.
const publicDir = new URL('../apps/web/public/', import.meta.url)
const contents = async (name) => {
  const svg = await readFile(new URL(name, publicDir), 'utf8')
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
${logo}
</svg>
`,
  )
}
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
