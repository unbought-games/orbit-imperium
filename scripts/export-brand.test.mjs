import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import sharp from 'sharp'

const asset = (name) =>
  readFile(new URL(`../apps/web/public/${name}`, import.meta.url))

for (const [name, size] of [
  ['icon.svg', 1024],
  ['icon-1024.png', 1024],
  ['apple-touch-icon.png', 180],
]) {
  test(`${name} leaves breathing room around the visible artwork`, async () => {
    const { data, info } = await sharp(await asset(name))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    assert.equal(info.width, size)
    assert.equal(info.height, size)
    const xs = []
    const ys = []
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4
        // Separate champagne/ice foreground from navy and antialiased edges.
        if (
          data[i] > 140 &&
          data[i + 1] > 140 &&
          data[i + 2] > 120 &&
          data[i + 3] > 240
        ) {
          xs.push(x)
          ys.push(y)
        }
      }
    }
    assert.ok(xs.length > 0, 'artwork must remain visible')
    for (const coordinates of [xs, ys]) {
      const min = coordinates.reduce((a, b) => Math.min(a, b), size)
      const max = coordinates.reduce((a, b) => Math.max(a, b), 0)
      assert.ok(min / size >= 0.12, 'leading edge needs at least 12% padding')
      assert.ok(
        (size - 1 - max) / size >= 0.12,
        'trailing edge needs at least 12% padding',
      )
      assert.ok(
        (max - min + 1) / size >= 0.65,
        'artwork should still fill at least 65% of the tile',
      )
    }
  })
}

test('home-screen PNGs match the SVG source and iOS has an opaque background', async () => {
  const svg = await asset('icon.svg')
  for (const [name, size, flatten] of [
    ['icon-1024.png', 1024, false],
    ['apple-touch-icon.png', 180, true],
  ]) {
    let expected = sharp(svg).resize(size, size)
    if (flatten) expected = expected.flatten({ background: '#0d1827' })
    const actual = sharp(await asset(name))
    assert.deepEqual(
      await actual.ensureAlpha().raw().toBuffer(),
      await expected.ensureAlpha().raw().toBuffer(),
    )
    if (flatten) assert.equal((await actual.stats()).isOpaque, true)
  }
})
