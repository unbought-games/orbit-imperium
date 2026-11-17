import test from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { readFile } from 'node:fs/promises'
import { paintEmblems, sample } from './emblem-render.mjs'
const rgba = (w, h, color) =>
  Buffer.from(Array.from({ length: w * h }, () => color).flat())
const config = {
  width: 8,
  height: 8,
  slots: [
    {
      quad: [
        [1, 1],
        [7, 1],
        [7, 7],
        [1, 7],
      ],
    },
  ],
  paint: { opacity: 1, responseFloor: 0, responseCeiling: 1.5 },
}
const texture = {
  width: 2,
  height: 2,
  pixels: rgba(2, 2, [255, 255, 255, 255]),
}
test('premultiplied sampling excludes hidden RGB in transparent texels', () => {
  const tex = {
    width: 2,
    height: 1,
    pixels: Buffer.from([255, 0, 0, 255, 0, 255, 0, 0]),
  }
  assert.deepEqual(sample(tex, 0.5, 0.5), [0.5, 0, 0, 0.5])
})
test('opaque decal respects authored occlusion, bounds and original alpha', () => {
  const hull = rgba(8, 8, [24, 40, 60, 193]),
    receiver = rgba(8, 8, [255, 255, 255, 255]),
    response = rgba(8, 8, [51, 51, 0, 255])
  receiver[(3 * 8 + 3) * 4 + 3] = 0
  const result = paintEmblems(hull, texture, config, receiver, response)
  assert.deepEqual(
    [...result.slice((3 * 8 + 3) * 4, (3 * 8 + 3) * 4 + 4)],
    [24, 40, 60, 193],
  )
  assert.deepEqual([...result.slice(0, 4)], [24, 40, 60, 193])
  assert.deepEqual(
    [...result.slice((4 * 8 + 4) * 4, (4 * 8 + 4) * 4 + 4)],
    [255, 255, 255, 193],
  )
  for (let p = 3; p < result.length; p += 4) assert.equal(result[p], hull[p])
})
test('paint uses fixed surface illumination, independent of chosen hull color', () => {
  const receiver = rgba(8, 8, [255, 255, 255, 255]),
    response = rgba(8, 8, [25, 154, 0, 255]) // approximately 0.5 linear
  const dark = paintEmblems(
    rgba(8, 8, [10, 20, 30, 255]),
    texture,
    config,
    receiver,
    response,
  )
  const pink = paintEmblems(
    rgba(8, 8, [200, 30, 130, 255]),
    texture,
    config,
    receiver,
    response,
  )
  const p = (4 * 8 + 4) * 4
  assert.equal(dark[p], 188)
  assert.deepEqual([...dark.slice(p, p + 3)], [...pink.slice(p, p + 3)])
})
test('reject mismatched maps before projecting', () => {
  assert.throws(
    () =>
      paintEmblems(
        Buffer.alloc(0),
        texture,
        config,
        Buffer.alloc(0),
        Buffer.alloc(0),
      ),
    /dimensions/,
  )
})
const root = new URL('./', import.meta.url)
const raw = async (path) =>
  sharp(new URL(path, root).pathname).ensureAlpha().raw().toBuffer()
test('Concord rerender is byte deterministic and cannot change glass, emissions, trim or silhouette', async () => {
  const config = JSON.parse(
    await readFile(new URL('concord-emblems-v1/slots.json', root)),
  )
  const hull = await raw('output/finish/rose.png'),
    receiver = await raw('output/emblems/receiver.png'),
    response = await raw('output/emblems/decal-response.png')
  const pixels = await raw('output/emblems/helix-full.png')
  const { width, height } = await sharp(
    new URL('output/emblems/helix-full.png', root).pathname,
  ).metadata()
  const texture = { pixels, width, height }
  const result = paintEmblems(hull, texture, config, receiver, response)
  const exported = await raw('output/emblems/helix-rose-full-paired.png')
  assert.deepEqual(Buffer.from(result), exported)
  let changed = 0
  for (let p = 0; p < result.length; p += 4) {
    assert.equal(result[p + 3], hull[p + 3])
    if (!receiver[p + 3])
      assert.deepEqual([...result.slice(p, p + 3)], [...hull.slice(p, p + 3)])
    if (result[p] !== hull[p]) changed++
  }
  assert.ok(changed > 5000)
  for (const [x, y] of [
    [570, 530],
    [670, 260],
    [1260, 348],
    [1196, 439],
  ]) {
    const p = (y * config.width + x) * 4
    assert.deepEqual([...result.slice(p, p + 4)], [...hull.slice(p, p + 4)])
  }
})
