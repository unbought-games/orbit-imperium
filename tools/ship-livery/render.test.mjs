import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import sharp from 'sharp'
import {
  renderLivery,
  presets,
  homography,
  inverse,
  project,
} from './render.mjs'
const art = new URL('./light-fighter-v1/', import.meta.url)
const asset = JSON.parse(await readFile(new URL('asset.json', art)))
const source = await sharp(new URL('master.png', art).pathname)
  .ensureAlpha()
  .raw()
  .toBuffer()
const mask = await sharp(await readFile(new URL('panels.svg', art)))
  .ensureAlpha()
  .raw()
  .toBuffer()
test('every livery preserves silhouette, glass, mechanisms, and all unmasked pixels', () => {
  for (const recipe of Object.values(presets)) {
    const output = renderLivery(source, mask, asset, recipe)
    let changed = 0
    for (let p = 0; p < source.length; p += 4) {
      assert.equal(output[p + 3], source[p + 3])
      if (!mask[p + 3] || (!mask[p] && !mask[p + 1] && !mask[p + 2]))
        for (let c = 0; c < 3; c++) assert.equal(output[p + c], source[p + c])
      if (output[p] !== source[p]) changed++
    }
    assert.ok(
      changed > 50000,
      'livery must visibly recolor meaningful surface area',
    )
  }
})
test('identical recipes reproduce exact output bytes and do not mutate the master', () => {
  const before = Buffer.from(source),
    recipe = structuredClone(presets.vermilion),
    snapshot = JSON.stringify(recipe)
  assert.deepEqual(
    renderLivery(source, mask, asset, recipe),
    renderLivery(source, mask, asset, recipe),
  )
  assert.deepEqual(source, before)
  assert.equal(JSON.stringify(recipe), snapshot)
})
test('authored paint masks protect known glass, vents, machinery and drive light probes', () => {
  for (const [x, y] of [
    [620, 515],
    [1160, 376],
    [480, 258],
    [700, 340],
    [1004, 552],
    [449, 450],
    [492, 635],
  ]) {
    const p = (y * asset.width + x) * 4
    assert.equal(
      (mask[p] + mask[p + 1] + mask[p + 2]) * mask[p + 3],
      0,
      `protected point ${x},${y}`,
    )
  }
})
test('projective decal placement maps all four corners, including non-affine perspective', () => {
  const q = [
      [10, 20],
      [120, 30],
      [90, 130],
      [30, 100],
    ],
    h = homography(q),
    inv = inverse(h)
  for (const [i, uv] of [
    [0, [0, 0]],
    [1, [1, 0]],
    [2, [1, 1]],
    [3, [0, 1]],
  ]) {
    const xy = project(h, ...uv)
    xy.forEach((v, c) => assert.ok(Math.abs(v - q[i][c]) < 1e-8))
    project(inv, ...q[i]).forEach((v, c) =>
      assert.ok(Math.abs(v - uv[c]) < 1e-8),
    )
  }
  assert.throws(() =>
    homography([
      [0, 0],
      [0, 0],
      [0, 0],
      [0, 0],
    ]),
  )
})
test('original mode is lossless, and invalid dimensions fail before rendering', () => {
  assert.deepEqual(
    Buffer.from(
      renderLivery(source, mask, asset, presets.porcelain, { original: true }),
    ),
    source,
  )
  assert.throws(() =>
    renderLivery(source, mask.subarray(4), asset, presets.porcelain),
  )
})
test('changing a group cannot recolor other paint groups', () => {
  const a = { ...presets.porcelain, emblem: 'none', pattern: 'solid' },
    b = { ...a, colors: ['#ff0000', ...a.colors.slice(1)] }
  const first = renderLivery(source, mask, asset, a),
    second = renderLivery(source, mask, asset, b)
  for (let p = 0; p < mask.length; p += 4)
    if (mask[p] === 0)
      for (let c = 0; c < 4; c++) assert.equal(first[p + c], second[p + c])
})
