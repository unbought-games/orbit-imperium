import { homography, inverse, project, linear, srgb } from './math.mjs'
const lut = Float64Array.from({ length: 256 }, (_, i) => linear(i / 255))
// Bilinear sampling in premultiplied linear RGB prevents dark/colored alpha fringes.
export function sample(texture, u, v) {
  const { pixels, width, height } = texture
  const x = u * width - 0.5,
    y = v * height - 0.5,
    ix = Math.floor(x),
    iy = Math.floor(y)
  const out = [0, 0, 0, 0]
  for (let dy = 0; dy < 2; dy++)
    for (let dx = 0; dx < 2; dx++) {
      const xx = ix + dx,
        yy = iy + dy
      if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue
      const p = (yy * width + xx) * 4,
        w = (dx ? x - ix : 1 - x + ix) * (dy ? y - iy : 1 - y + iy),
        a = (pixels[p + 3] / 255) * w
      for (let c = 0; c < 3; c++) out[c] += lut[pixels[p + c]] * a
      out[3] += a
    }
  return out
}
export function paintEmblems(
  hull,
  texture,
  { width, height, slots, paint },
  receiver,
  response,
  { flat = false } = {},
) {
  const length = width * height * 4
  if (
    hull.length !== length ||
    receiver.length !== length ||
    response.length !== length
  )
    throw Error('Map dimensions do not match')
  if (texture.pixels.length !== texture.width * texture.height * 4)
    throw Error('Texture dimensions do not match')
  const output = new Uint8ClampedArray(hull)
  for (const slot of slots) {
    const transform = inverse(homography(slot.quad))
    const xs = slot.quad.map((p) => p[0]),
      ys = slot.quad.map((p) => p[1])
    for (
      let y = Math.max(0, Math.floor(Math.min(...ys)));
      y < Math.min(height, Math.ceil(Math.max(...ys)));
      y++
    )
      for (
        let x = Math.max(0, Math.floor(Math.min(...xs)));
        x < Math.min(width, Math.ceil(Math.max(...xs)));
        x++
      ) {
        const p = (y * width + x) * 4
        if (!hull[p + 3] || !receiver[p + 3]) continue
        const ink = [0, 0, 0, 0]
        // Four subpixel samples; exports are downsampled from the source-size bake.
        for (const [ox, oy] of [
          [0.25, 0.25],
          [0.75, 0.25],
          [0.25, 0.75],
          [0.75, 0.75],
        ]) {
          const [u, v] = project(transform, x + ox, y + oy)
          if (u < 0 || v < 0 || u > 1 || v > 1) continue
          const s = sample(texture, u, v)
          for (let c = 0; c < 4; c++) ink[c] += s[c] / 4
        }
        const coverage = (receiver[p + 3] / 255) * paint.opacity,
          a = ink[3] * coverage
        if (!a) continue
        const illumination = flat
          ? 1
          : Math.max(
              paint.responseFloor,
              Math.min(
                paint.responseCeiling,
                ((response[p] * 256 + response[p + 1]) / 65535) * 5,
              ),
            )
        for (let c = 0; c < 3; c++)
          output[p + c] = srgb(
            lut[output[p + c]] * (1 - a) + ink[c] * coverage * illumination,
          )
      }
  }
  return output
}
