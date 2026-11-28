// Offline paint study. Only "init" seeds a material selection from the beauty image.
// Later renders always use the saved, editable mask in the ship directory.
import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { renderFinish } from '../../../../packages/ship-appearance/finish.mjs'
import { linear } from '../../../../packages/ship-appearance/math.mjs'

const [action, ship, primary, accent, destination] = process.argv.slice(2)
if (
  !['init', 'render'].includes(action) ||
  !/^[a-z]+(?:-[a-z]+)*$/.test(ship || '')
)
  throw Error(
    'Use init <ship> or render <ship> <primary hex> <accent hex> <output.png>',
  )
const file = (name) => new URL('./' + ship + '/' + name, import.meta.url)
const master = await readFile(file('master.png'))
const hash = createHash('sha256').update(master).digest('hex')
const { data: source, info } = await sharp(master)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true })
const { width, height } = info
const format = { raw: { width, height, channels: 4 } }
const clamp = (n) => Math.min(1, Math.max(0, n))

if (action === 'init') {
  const mask = Buffer.alloc(source.length)
  const samples = [[], []]
  let protectedAreas
  try {
    protectedAreas = await sharp(await readFile(file('protected.svg')))
      .ensureAlpha()
      .raw()
      .toBuffer()
    if (protectedAreas.length !== source.length)
      throw Error('Protection geometry must fit the master')
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  for (let i = 0; i < source.length; i += 4) {
    if (source[i + 3] < 16) continue
    const r = source[i],
      g = source[i + 1],
      b = source[i + 2]
    const cool = (b - r) / (b + r + 1)
    const warm = -cool
    // Narrow the candidates to slate paint and warm ochre. Saturated emitters,
    // dark mechanisms, glass and photovoltaic cells retain the source finish.
    const hull =
      clamp((cool - 0.008) / 0.043) *
      clamp((0.36 - cool) / 0.1) *
      clamp((g - 45) / 32) *
      clamp((g - r + 2) / 7) *
      clamp((b - g + 2) / 7)
    const trim =
      clamp((warm - 0.044) / 0.075) *
      clamp((0.55 - warm) / 0.1) *
      clamp((g - 47) / 37) *
      clamp((r - g + 1) / 8) *
      clamp((g - b + 1) / 8)
    const channel = trim > hull ? 1 : 0
    const coverage =
      Math.max(trim, hull) * (1 - (protectedAreas?.[i + 3] ?? 0) / 255)
    if (!coverage) continue
    mask[i + channel] = 255
    mask[i + 3] = Math.round(255 * coverage)
    if (coverage > 0.98 && source[i + 3] >= 245 && (i / 4) % 16 === 0)
      samples[channel].push([r, g, b])
  }
  const reference = samples.map((pixels) => {
    if (!pixels.length) throw Error('No reference-color sample')
    pixels.sort((a, b) => a[1] - b[1])
    return (
      '#' + Buffer.from(pixels[Math.floor(pixels.length * 0.7)]).toString('hex')
    )
  })
  await writeFile(
    file('material-mask.png'),
    await sharp(mask, format).png().toBuffer(),
    { flag: 'wx' },
  )
  await writeFile(
    file('paint.json'),
    JSON.stringify({ masterSha256: hash, width, height, reference }, null, 2) +
      '\n',
    { flag: 'wx' },
  )
} else {
  if (!destination) throw Error('Supply a path for the recolored PNG')
  const calibration = JSON.parse(await readFile(file('paint.json')))
  if (calibration.masterSha256 !== hash)
    throw Error('Changed master; re-author the mask and reference')
  const { data: mask, info: maskInfo } = await sharp(
    await readFile(file('material-mask.png')),
  )
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  if (maskInfo.width !== width || maskInfo.height !== height)
    throw Error('Mask dimensions differ from master')
  // The source paint is matte. Use relative luminance as its draft diffuse
  // response so tiny variations in the blue pigment do not amplify into noise.
  const lut = Array.from({ length: 256 }, (_, i) => linear(i / 255))
  const luminance = (r, g, b) =>
    lut[r] * 0.2126 + lut[g] * 0.7152 + lut[b] * 0.0722
  const swatches = calibration.reference.map((hex) =>
    luminance(...Buffer.from(hex.slice(1), 'hex')),
  )
  const responseMap = Buffer.alloc(source.length)
  for (let i = 0; i < source.length; i += 4) {
    if (!mask[i + 3]) continue
    const mix = mask[i + 1] / 255
    const referenceLuma = swatches[0] * (1 - mix) + swatches[1] * mix
    const diffuse =
      luminance(source[i], source[i + 1], source[i + 2]) / referenceLuma
    responseMap.writeUInt16BE(Math.round(clamp(diffuse / 5) * 65535), i)
    responseMap[i + 3] = 255
  }
  const painted = renderFinish(
    source,
    mask,
    { colors: [primary, accent] },
    { ...calibration, responseMap },
  )
  await sharp(painted, format).png().toFile(destination)
}
