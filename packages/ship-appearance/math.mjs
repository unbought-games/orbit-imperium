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
