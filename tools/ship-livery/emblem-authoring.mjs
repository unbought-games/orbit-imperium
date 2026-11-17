import sharp from 'sharp'
// Compile fixed lighting/detail once from the immutable beauty source, not the selected livery.
// This is an empirical paint response, not reconstructed normals or physical light transport.
export async function compileDecalResponse(source, response, width, height) {
  const low = await sharp(source, { raw: { width, height, channels: 4 } })
    .blur(3)
    .raw()
    .toBuffer()
  const out = Buffer.from(response)
  const luminance = (b, p) =>
    0.2126 * b[p] + 0.7152 * b[p + 1] + 0.0722 * b[p + 2]
  for (let p = 0; p < source.length; p += 4) {
    const fine = Math.max(
      0.35,
      Math.min(1.2, (luminance(source, p) + 3) / (luminance(low, p) + 3)),
    )
    const v = Math.round(
      Math.min(65535, (response[p] * 256 + response[p + 1]) * fine),
    )
    out[p] = v >> 8
    out[p + 1] = v & 255
  }
  return out
}
