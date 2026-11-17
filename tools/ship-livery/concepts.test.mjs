import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { renderLivery, homography, inverse, project } from './render.mjs'
import { concepts, conceptPresets } from './concepts.mjs'
for (const concept of concepts) {
  const root = new URL(concept.id + '/', import.meta.url),
    asset = JSON.parse(await readFile(new URL('asset.json', root)))
  const master = await readFile(new URL('master.png', root)),
    source = await sharp(master).ensureAlpha().raw().toBuffer(),
    mask = await sharp(await readFile(new URL('panels.svg', root)))
      .ensureAlpha()
      .raw()
      .toBuffer()
  test(`${concept.name}: masks belong to frozen master and exactly two meaningful paint groups`, () => {
    assert.equal(
      createHash('sha256').update(master).digest('hex'),
      asset.masterSha256,
    )
    assert.deepEqual(asset.groups, ['Primary', 'Accent'])
    const counts = [0, 0]
    for (let p = 0; p < mask.length; p += 4) {
      assert.equal(mask[p + 2], 0)
      if (source[p + 3] > 127)
        for (let g = 0; g < 2; g++)
          if (mask[p + g] > 127 && mask[p + 3] > 127) counts[g]++
    }
    assert.ok(counts[0] > 200000)
    assert.ok(counts[1] > 30000)
  })
  test(`${concept.name}: black, white and saturated paint preserve alpha and every unmasked pixel`, () => {
    for (const color of ['#050505', '#ffffff', '#d900c9']) {
      const r = { ...conceptPresets.graphite, colors: [color, color] },
        output = renderLivery(source, mask, asset, r)
      for (let p = 0; p < source.length; p += 4) {
        assert.equal(output[p + 3], source[p + 3])
        if (!mask[p + 3] || !(mask[p] || mask[p + 1]))
          for (let c = 0; c < 3; c++) assert.equal(output[p + c], source[p + c])
      }
    }
  })
  test(`${concept.name}: combustion glow, canopy and machinery remain outside paint groups`, () => {
    for (const [x, y] of asset.protectedPoints) {
      const p = (y * asset.width + x) * 4
      assert.equal(
        (mask[p] + mask[p + 1]) * mask[p + 3],
        0,
        `protected point ${x},${y}`,
      )
    }
    for (const [x, y, w, h] of asset.protectedEngineRects)
      for (let dy = 0; dy < h; dy++)
        for (let dx = 0; dx < w; dx++) {
          const p = ((y + dy) * asset.width + x + dx) * 4
          assert.equal(
            (mask[p] + mask[p + 1]) * mask[p + 3],
            0,
            `engine pixel ${x + dx},${y + dy}`,
          )
        }
  })
  test(`${concept.name}: primary and accent remain independent and repeatable`, () => {
    const first = renderLivery(source, mask, asset, conceptPresets.graphite)
    for (const g of [0, 1]) {
      const recipe = {
        ...conceptPresets.graphite,
        colors: conceptPresets.graphite.colors.map((v, i) =>
          g === i ? '#ee22bb' : v,
        ),
      }
      const other = renderLivery(source, mask, asset, recipe)
      let changes = 0
      for (let p = 0; p < source.length; p += 4) {
        if (mask[p + g] === 0)
          for (let c = 0; c < 4; c++) assert.equal(first[p + c], other[p + c])
        else if (first[p] !== other[p]) changes++
      }
      assert.ok(changes > 10000)
      assert.deepEqual(other, renderLivery(source, mask, asset, recipe))
    }
  })
  test(`${concept.name}: two-color bands and projected insignias stay within the primary paint group`, () => {
    const r = conceptPresets.graphite,
      base = renderLivery(source, mask, asset, r)
    for (const patch of [{ pattern: 'bands' }, { emblem: 'chevron' }]) {
      const output = renderLivery(source, mask, asset, { ...r, ...patch })
      let changes = 0
      for (let p = 0; p < source.length; p += 4) {
        if (mask[p] === 0)
          for (let c = 0; c < 4; c++) assert.equal(output[p + c], base[p + c])
        if (output[p] !== base[p]) changes++
      }
      assert.ok(changes > 100)
    }
    for (const q of asset.decalSurfaces) {
      const h = homography(q),
        inv = inverse(h)
      for (const [i, uv] of [
        [0, [0, 0]],
        [1, [1, 0]],
        [2, [1, 1]],
        [3, [0, 1]],
      ]) {
        project(h, ...uv).forEach((v, j) =>
          assert.ok(Math.abs(v - q[i][j]) < 1e-8),
        )
        project(inv, ...q[i]).forEach((v, j) =>
          assert.ok(Math.abs(v - uv[j]) < 1e-8),
        )
      }
    }
  })
}
