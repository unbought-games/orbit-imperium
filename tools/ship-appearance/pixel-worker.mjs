import { parentPort, workerData } from 'node:worker_threads'
import sharp from 'sharp'
import { renderShipPixels } from '../../packages/ship-appearance/index.mjs'
import { MAX_OUTPUT_BYTES } from '../../packages/ship-appearance/validation.mjs'
const { asset, colors, emblem } = workerData
const pixels = renderShipPixels(asset, colors, emblem)
const { width, height } = asset.manifest
const variants = []
let total = 0
for (const size of [width, 768, 384, 192].filter(
  (value, index, array) => value <= width && array.indexOf(value) === index,
)) {
  const h = Math.round((size * height) / width)
  for (const format of ['png', 'webp']) {
    const image = sharp(pixels, { raw: { width, height, channels: 4 } }).resize(
      size,
      h,
    )
    const bytes = await (
      format === 'png' ? image.png() : image.webp({ lossless: true })
    ).toBuffer()
    total += bytes.length
    if (total > MAX_OUTPUT_BYTES) throw Error('Render output exceeded bound')
    variants.push({
      width: size,
      height: h,
      mime_type: 'image/' + format,
      data_base64: bytes.toString('base64'),
    })
  }
}
parentPort.postMessage(variants)
