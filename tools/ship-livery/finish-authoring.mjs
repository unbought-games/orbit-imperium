import { fitResponse, materialReference } from './finish-render.mjs'
import { linear } from './render.mjs'
// Offline edge-aware smoothing limits dark-master quantization noise amplified by pale dyes.
export function compileResponse(source, mask) {
  const refs = materialReference.map((hex) =>
    [1, 3, 5].map((i) => linear(parseInt(hex.slice(i, i + 2), 16) / 255)),
  )
  const values = new Float32Array(source.length / 4),
    luma = new Float32Array(values.length)
  for (let n = 0; n < values.length; n++) {
    const p = n * 4,
      m = mask[p + 1] / 255
    luma[n] = (source[p] + source[p + 1] + source[p + 2]) / 3
    if (!mask[p + 3]) continue
    const rgb = [0, 1, 2].map((c) => linear(source[p + c] / 255)),
      ref = refs[0].map((v, c) => v * (1 - m) + refs[1][c] * m)
    values[n] = fitResponse(rgb, ref)
  }
  const output = new Uint8ClampedArray(source.length)
  for (let n = 0; n < values.length; n++) {
    const p = n * 4
    if (!mask[p + 3]) continue
    const x = n % 1536,
      y = Math.floor(n / 1536)
    let total = 0,
      weights = 0
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        if (x + dx < 0 || x + dx >= 1536 || y + dy < 0 || y + dy >= 1024)
          continue
        const k = n + dy * 1536 + dx
        if (
          mask[k * 4 + 3] < 200 ||
          Math.abs(mask[k * 4 + 1] - mask[p + 1]) > 12
        )
          continue
        const difference = luma[n] - luma[k],
          w = Math.exp(
            -(dx * dx + dy * dy) / 3 - (difference * difference) / 25,
          )
        total += values[k] * w
        weights += w
      }
    const value = weights ? total / weights : values[n],
      q = Math.round((value / 5) * 65535)
    output[p] = q >> 8
    output[p + 1] = q & 255
    output[p + 3] = 255
  }
  return output
}
