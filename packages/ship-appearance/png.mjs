// Decode the package's deliberately narrow RGBA8 PNG format without Canvas
// premultiplication/color-management changing packed material/response bytes.
export function validatePackagePngHeader(bytes, width, height) {
  const input = new Uint8Array(bytes),
    view = new DataView(input.buffer, input.byteOffset, input.byteLength)
  if (
    input.length < 33 ||
    input.slice(0, 8).join(',') !== '137,80,78,71,13,10,26,10'
  )
    throw Error('Invalid PNG signature')
  if (
    view.getUint32(8) !== 13 ||
    String.fromCharCode(...input.slice(12, 16)) !== 'IHDR' ||
    view.getUint32(16) !== width ||
    view.getUint32(20) !== height ||
    input[24] !== 8 ||
    input[25] !== 6 ||
    input[26] !== 0 ||
    input[27] !== 0 ||
    input[28] !== 0
  )
    throw Error('Expected non-interlaced RGBA8 package map')
  return { input, view }
}
export async function decodePackagePng(bytes, width, height) {
  const { input, view } = validatePackagePngHeader(bytes, width, height)
  const chunks = []
  let ended = false
  for (let offset = 8; offset < input.length; ) {
    const length = view.getUint32(offset)
    if (offset + 12 + length > input.length) throw Error('Truncated PNG')
    const type = String.fromCharCode(...input.slice(offset + 4, offset + 8))
    if (type === 'IDAT')
      chunks.push(input.slice(offset + 8, offset + 8 + length))
    if (type === 'IEND') {
      ended = true
      break
    }
    offset += length + 12
  }
  if (!ended || !chunks.length) throw Error('Incomplete PNG')
  const stride = width * 4,
    expected = (stride + 1) * height
  const reader = new Blob(chunks)
    .stream()
    .pipeThrough(new DecompressionStream('deflate'))
    .getReader()
  const filtered = new Uint8Array(expected)
  let count = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (count + value.length > expected)
        throw Error('PNG expansion bound exceeded')
      filtered.set(value, count)
      count += value.length
    }
  } finally {
    await reader.cancel()
  }
  if (count !== expected) throw Error('PNG data length mismatch')
  const output = new Uint8ClampedArray(width * height * 4)
  const paeth = (a, b, c) => {
    const p = a + b - c,
      pa = Math.abs(p - a),
      pb = Math.abs(p - b),
      pc = Math.abs(p - c)
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
  }
  for (let y = 0; y < height; y++) {
    const row = y * (stride + 1),
      filter = filtered[row]
    if (filter > 4) throw Error('Invalid PNG filter')
    for (let x = 0; x < stride; x++) {
      const index = y * stride + x,
        a = x >= 4 ? output[index - 4] : 0,
        b = y ? output[index - stride] : 0,
        c = y && x >= 4 ? output[index - stride - 4] : 0
      const prediction = [0, a, b, Math.floor((a + b) / 2), paeth(a, b, c)][
        filter
      ]
      output[index] = (filtered[row + 1 + x] + prediction) & 255
    }
  }
  return output
}
