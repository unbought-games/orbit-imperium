import { test } from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { renderFinish, finishPresets, fitResponse } from './finish-render.mjs'
const root = new URL('./', import.meta.url)
const load = (path) =>
  sharp(new URL(path, root).pathname).ensureAlpha().raw().toBuffer()
const source = await load('concord-finish-v2/finished-master.png'),
  gray = await load('concord-v1/master.png'),
  mask = await load('output/finish/material-mask.png'),
  responseMap = await load('output/finish/response-map.png')
test('navy/gold identity reconstructs the approved master byte-for-byte', () =>
  assert.deepEqual(
    Buffer.from(
      renderFinish(source, mask, finishPresets.navy, { responseMap }),
    ),
    source,
  ))
test('all palettes preserve alpha and every fully protected pixel', () => {
  for (const recipe of Object.values(finishPresets)) {
    const result = renderFinish(source, mask, recipe, { responseMap })
    let changes = 0
    for (let p = 0; p < result.length; p += 4) {
      assert.equal(result[p + 3], source[p + 3])
      if (!mask[p + 3])
        for (let c = 0; c < 3; c++) assert.equal(result[p + c], source[p + c])
      if (result[p] !== source[p]) changes++
    }
    if (recipe !== finishPresets.navy) assert.ok(changes > 400000)
  }
})
test('canopy reflection and red combustion pixels remain unchanged in both source modes', () => {
  for (const base of [source, gray]) {
    const mode = base === source ? 'finished' : 'gray'
    const result = renderFinish(base, mask, finishPresets.pearl, {
      mode,
      responseMap,
    })
    for (const [x, y] of [
      [520, 550],
      [580, 510],
      [600, 480],
      [650, 450],
      [460, 620],
    ]) {
      const p = (y * 1536 + x) * 4
      assert.deepEqual([...result.slice(p, p + 4)], [...base.slice(p, p + 4)])
    }
    let protectedCount = 0
    for (const [left, top, right, bottom] of [
      [595, 231, 730, 294],
      [1180, 298, 1315, 388],
    ])
      for (let y = top + 1; y < bottom; y++)
        for (let x = left + 1; x < right; x++) {
          const p = (y * 1536 + x) * 4
          if (
            source[p] > source[p + 1] * 1.2 &&
            source[p] > source[p + 2] * 2
          ) {
            assert.equal(mask[p + 3], 0)
            assert.deepEqual(
              [...result.slice(p, p + 4)],
              [...base.slice(p, p + 4)],
            )
            protectedCount++
          }
        }
    assert.ok(protectedCount > 1000)
  }
})
test('changing primary cannot change fully accent pixels and vice versa', () => {
  const first = renderFinish(source, mask, finishPresets.navy, { responseMap })
  for (const group of [0, 1]) {
    const recipe = {
        colors: finishPresets.navy.colors.map((v, i) =>
          i === group ? '#eb427c' : v,
        ),
      },
      next = renderFinish(source, mask, recipe, { responseMap })
    let protectedCount = 0
    for (let p = 0; p < mask.length; p += 4) {
      if (mask[p + 1] === (group === 0 ? 255 : 0) && mask[p + 3]) {
        for (let c = 0; c < 4; c++) assert.equal(first[p + c], next[p + c])
        protectedCount++
      }
    }
    assert.ok(protectedCount > 50000)
  }
})
test('repeated edits never accumulate and never modify the inputs', () => {
  const before = Buffer.from(source),
    r = structuredClone(finishPresets.rose)
  const first = renderFinish(source, mask, r, { responseMap })
  renderFinish(source, mask, finishPresets.cobalt, { responseMap })
  assert.deepEqual(first, renderFinish(source, mask, r, { responseMap }))
  assert.deepEqual(source, before)
  assert.deepEqual(r, finishPresets.rose)
})
test('invalid sizes and colors are rejected', () => {
  assert.throws(() =>
    renderFinish(source.subarray(4), mask, finishPresets.rose),
  )
  assert.throws(() =>
    renderFinish(source, mask, { colors: ['red', '#ffffff'] }),
  )
  assert.throws(() =>
    renderFinish(source, mask, finishPresets.rose, {
      responseMap: responseMap.subarray(4),
    }),
  )
})
test('the source-response fit separates colored response from neutral reflection', () => {
  assert.ok(
    Math.abs(fitResponse([0.12, 0.22, 0.42], [0.1, 0.2, 0.4]) - 1) < 1e-8,
  )
  assert.ok(Math.abs(fitResponse([0.1, 0.1, 0.1], [0.1, 0.2, 0.4])) < 1e-12)
})
test('expanded coating reaches fin sides, wing borders and canopy surrounds', () => {
  for (const [x, y] of [
    [1180, 180],
    [1468, 518],
    [760, 441],
    [350, 780],
    [220, 372],
  ]) {
    const p = (y * 1536 + x) * 4
    assert.ok(source[p + 3] > 200)
    assert.ok(mask[p + 3] > 240, `unpainted hull point ${x},${y}`)
  }
})

test('pure black remains dark paint with readable illuminated armor', () => {
  const result = renderFinish(
    source,
    mask,
    { colors: ['#000000', '#d2dce5'] },
    { responseMap },
  )
  const p = (400 * 1536 + 400) * 4
  assert.ok(Math.max(...result.slice(p, p + 3)) > 10)
  assert.ok(Math.max(...result.slice(p, p + 3)) < 40)
  assert.equal(result[p + 3], source[p + 3])
})
