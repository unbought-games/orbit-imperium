// Fixed-view material recoloring. No generative inference, masks or lighting classification at runtime.
import { linear, srgb } from './math.mjs'
const rgb = (hex) =>
  [1, 3, 5].map((i) => linear(parseInt(hex.slice(i, i + 2), 16) / 255))
const lookup = Float64Array.from({ length: 256 }, (_, i) => linear(i / 255))
const luminance = (c) => c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722
export function fitResponse(s, ref) {
  const meanRef = (ref[0] + ref[1] + ref[2]) / 3,
    meanSource = (s[0] + s[1] + s[2]) / 3
  let numerator = 0,
    denominator = 0
  for (let c = 0; c < 3; c++) {
    numerator += (ref[c] - meanRef) * (s[c] - meanSource)
    denominator += (ref[c] - meanRef) ** 2
  }
  return Math.max(0, Math.min(5, numerator / Math.max(denominator, 1e-8)))
}
export function renderFinish(
  source,
  mask,
  recipe,
  { width, height, reference, responseMap },
) {
  if (source.length !== width * height * 4 || mask.length !== source.length)
    throw Error('Unexpected source or mask size')
  if (
    recipe.colors.length !== 2 ||
    recipe.colors.some((c) => !/^#[0-9a-f]{6}$/i.test(c))
  )
    throw Error('Two valid hex colors required')
  if (responseMap && responseMap.length !== source.length)
    throw Error('Response map dimensions do not match')
  const dyes = recipe.colors.map(rgb),
    refs = reference.map(rgb),
    out = new Uint8ClampedArray(source)
  // A pigment swatch is not an unlit display pixel. Keep a small diffuse floor
  // for near-black paint so the fixed illumination can still reveal the hull.
  const paintLift = Math.max(0, 0.006 - luminance(dyes[0]))
  for (let c = 0; c < 3; c++) dyes[0][c] += paintLift
  const s = [0, 0, 0],
    target = [0, 0, 0],
    ref = [0, 0, 0],
    result = [0, 0, 0]
  for (let p = 0; p < source.length; p += 4) {
    if (source[p + 3] < 16 || !mask[p + 3]) continue
    const metal = mask[p + 1] / 255,
      coverage = mask[p + 3] / 255
    for (let c = 0; c < 3; c++) {
      s[c] = lookup[source[p + c]]
      target[c] = dyes[0][c] * (1 - metal) + dyes[1][c] * metal
      ref[c] = refs[0][c] * (1 - metal) + refs[1][c] * metal
    }
    {
      // Fit colored surface response plus a neutral reflection. Residual stays in source.
      const diffuse = responseMap
        ? ((responseMap[p] * 256 + responseMap[p + 1]) / 65535) * 5
        : fitResponse(s, ref)
      for (let c = 0; c < 3; c++)
        result[c] = s[c] + diffuse * (target[c] - ref[c])
      // A smooth shoulder for brighter replacement materials prevents white/pink clipping.
      const brighter = Math.max(
        0,
        (luminance(target) - luminance(ref)) / (1 - luminance(ref)),
      )
      const peak = Math.max(result[0], result[1], result[2])
      if (peak > 0.72 && brighter > 0) {
        const compressed = 0.72 + 0.28 * (1 - Math.exp(-(peak - 0.72) / 0.28))
        const scale = 1 - brighter + (brighter * compressed) / peak
        for (let c = 0; c < 3; c++) result[c] *= scale
      }
    }
    for (let c = 0; c < 3; c++)
      out[p + c] = srgb(
        s[c] * (1 - coverage) + Math.max(0, result[c]) * coverage,
      )
  }
  return out
}
