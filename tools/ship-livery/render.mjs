// Pure shared renderer: Node exports and interactive browser use identical math.
export const presets = {
  porcelain: {
    label: 'Porcelain',
    colors: ['#e6e9e8', '#84949e', '#c5a467'],
    pattern: 'solid',
    emblem: 'chevron',
    finish: 'satin',
  },
  obsidian: {
    label: 'Obsidian',
    colors: ['#161e2c', '#303c4c', '#c7a46a'],
    pattern: 'bands',
    emblem: 'chevron',
    finish: 'satin',
  },
  vermilion: {
    label: 'Vermilion',
    colors: ['#c52b36', '#351c27', '#e4c78a'],
    pattern: 'bands',
    emblem: 'chevron',
    finish: 'satin',
  },
}
export const linear = (v) =>
  v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
export const srgb = (v) =>
  Math.round(
    255 *
      Math.max(
        0,
        Math.min(
          1,
          v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055,
        ),
      ),
  )
const color = (hex) =>
  [1, 3, 5].map((i) => linear(parseInt(hex.slice(i, i + 2), 16) / 255))
// Project a unit square to a convex quadrilateral. Inverse is used per pixel.
export function homography(q) {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q
  const dx1 = x1 - x2,
    dx2 = x3 - x2,
    dx3 = x0 - x1 + x2 - x3
  const dy1 = y1 - y2,
    dy2 = y3 - y2,
    dy3 = y0 - y1 + y2 - y3
  const det = dx1 * dy2 - dx2 * dy1
  if (Math.abs(det) < 1e-8) throw Error('Degenerate decal surface')
  const g = (dx3 * dy2 - dx2 * dy3) / det,
    h = (dx1 * dy3 - dx3 * dy1) / det
  return [
    x1 - x0 + g * x1,
    x3 - x0 + h * x3,
    x0,
    y1 - y0 + g * y1,
    y3 - y0 + h * y3,
    y0,
    g,
    h,
    1,
  ]
}
export function inverse(m) {
  const [a, b, c, d, e, f, g, h, i] = m
  const adj = [
    e * i - f * h,
    c * h - b * i,
    b * f - c * e,
    f * g - d * i,
    a * i - c * g,
    c * d - a * f,
    d * h - e * g,
    b * g - a * h,
    a * e - b * d,
  ]
  const det = a * adj[0] + b * adj[3] + c * adj[6]
  if (Math.abs(det) < 1e-8) throw Error('Singular projection')
  return adj.map((v) => v / det)
}
export function project(m, x, y) {
  const w = m[6] * x + m[7] * y + m[8]
  return [(m[0] * x + m[1] * y + m[2]) / w, (m[3] * x + m[4] * y + m[5]) / w]
}
function chevron(u, v) {
  const x = Math.abs(u - 0.5),
    y = v - 0.28
  return x < 0.27 && y > x * 0.8 && y < x * 0.8 + 0.095
}
export function renderLivery(
  source,
  mask,
  asset,
  recipe,
  { debug = false, original = false } = {},
) {
  if (
    source.length !== asset.width * asset.height * 4 ||
    mask.length !== source.length
  )
    throw Error('Asset dimensions do not match')
  const output = new Uint8ClampedArray(source)
  if (original) return output
  const dyes = recipe.colors.map(color)
  const groupCount = asset.groups.length
  if (groupCount < 2 || groupCount > 3 || dyes.length !== groupCount)
    throw Error('Paint group count does not match recipe')
  const primaryLuminance =
    dyes[0][0] * 0.2126 + dyes[0][1] * 0.7152 + dyes[0][2] * 0.0722
  const decal = color(primaryLuminance > 0.35 ? '#172538' : '#f0eadb')
  const projections = asset.decalSurfaces.map((q) => inverse(homography(q)))
  for (let p = 0; p < source.length; p += 4) {
    if (
      !source[p + 3] ||
      !mask[p + 3] ||
      !(mask[p] || mask[p + 1] || mask[p + 2])
    )
      continue
    const weights = [0, 1, 2].map(
      (c) => ((mask[p + c] / 255) * mask[p + 3]) / 255,
    )
    const sum = weights.reduce((a, b) => a + b, 0)
    if (!sum || !source[p + 3]) continue
    const base = [source[p], source[p + 1], source[p + 2]].map((v) =>
      linear(v / 255),
    )
    const lum = base[0] * 0.2126 + base[1] * 0.7152 + base[2] * 0.0722
    const shade = lum / asset.referenceAlbedo
    // Baked neutral specular approximation, not a recovered physical light pass.
    const spec =
      Math.max(0, lum - 0.38) ** 2 * (recipe.finish === 'matte' ? 0.15 : 0.65)
    let paint = [0, 0, 0]
    for (let g = 0; g < groupCount; g++)
      for (let c = 0; c < 3; c++)
        paint[c] += weights[g] * (dyes[g][c] * shade + spec)
    const index = p / 4,
      x = (index % asset.width) + 0.5,
      y = Math.floor(index / asset.width) + 0.5
    if (
      weights[0] > 0.99 &&
      (recipe.pattern === 'bands' || recipe.emblem !== 'none')
    ) {
      for (const projection of projections) {
        const [u, v] = project(projection, x, y)
        if (u < 0 || u > 1 || v < 0 || v > 1) continue
        let bandCoverage = 0,
          emblemCoverage = 0
        for (const dx of [-0.25, 0.25])
          for (const dy of [-0.25, 0.25]) {
            const [su, sv] = project(projection, x + dx, y + dy)
            if (recipe.pattern === 'bands' && su > 0.78 && su < 0.88)
              bandCoverage += 0.25
            if (recipe.emblem === 'chevron' && chevron(su, sv))
              emblemCoverage += 0.25
          }
        paint = paint.map(
          (c, i) =>
            c * (1 - bandCoverage) +
            (dyes[asset.accentGroup ?? 2][i] * shade + spec) * bandCoverage,
        )
        paint = paint.map(
          (c, i) =>
            c * (1 - emblemCoverage) +
            (decal[i] * shade + spec) * emblemCoverage,
        )
      }
    }
    for (let c = 0; c < 3; c++)
      output[p + c] = debug
        ? Math.round(weights[c] * 255 + source[p + c] * (1 - sum))
        : srgb(base[c] * (1 - sum) + paint[c])
    // Alpha is copied byte-for-byte from the locked master.
  }
  return output
}
