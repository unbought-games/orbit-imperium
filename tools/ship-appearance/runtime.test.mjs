import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import Ajv2020 from 'ajv/dist/2020.js'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import { readFile, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import sharp from 'sharp'
import { renderPixels } from './renderer.mjs'
import {
  loadPackage,
  packageSelection,
  loadInstalledPackages,
  bundledAssets,
  resolveEmblemAssets,
  assetConfig,
  isPublicAddress,
} from './assets.mjs'
import { renderShipPixels } from '../../packages/ship-appearance/index.mjs'
import {
  validateRequest,
  validateManifest,
  validateAppearance,
} from '../../packages/ship-appearance/validation.mjs'
import { decodePackagePng } from '../../packages/ship-appearance/png.mjs'
import { renderFinish } from '../ship-livery/finish-render.mjs'
import { checkedAssetBytes } from '../../packages/ship-appearance/assets.mjs'
const root = new URL(
  '../../apps/web/public/art/ship-skins/orbit-light-fighter/concord-v1/',
  import.meta.url,
)
const schema = JSON.parse(
  await readFile(
    new URL(
      '../../packages/ship-appearance/manifest.schema.json',
      import.meta.url,
    ),
  ),
)
const checkSchema = new Ajv2020().compile(schema)
const asset = await loadPackage('orbit-light-fighter', 'concord-v1')
const request = {
  version: 1,
  request_id: '11111111-1111-4111-8111-111111111111',
  package_id: 'orbit-light-fighter',
  package_revision: 'concord-v1',
  colors: { primary: '#1e2e40', accent: '#cf9c48' },
  emblem: null,
}
const originals = await bundledAssets()
const [reference, svg] = [...originals.entries()][0]
const appearance = {
  recipe: {
    version: 3,
    symbol: 'compass',
    foreground: 'dye:navy',
    background: 'dye:gold',
  },
  asset_url: reference,
  rendering: {
    foreground: '#123456',
    background: '#abcdef',
    finish: null,
    effect: null,
  },
}

test('published manifest conforms to the machine-readable format and rejects executable extensions', () => {
  assert.equal(
    checkSchema(asset.manifest),
    true,
    JSON.stringify(checkSchema.errors),
  )
  assert.equal(checkSchema({ ...asset.manifest, shader: 'untrusted' }), false)
  assert.throws(() =>
    validateManifest({ ...asset.manifest, shader: 'untrusted' }),
  )
})

test('raw browser PNG decoder retains packed masks and transparent source RGB exactly', async () => {
  for (const map of Object.values(asset.manifest.maps)) {
    const bytes = await readFile(new URL(map.file, root))
    const expected = await sharp(bytes).ensureAlpha().raw().toBuffer()
    const decoded = await decodePackagePng(bytes, 1536, 1024)
    assert.deepEqual(Buffer.from(decoded), expected, map.file)
  }
  await assert.rejects(
    decodePackagePng(new Uint8Array([1, 2, 3]), 1, 1),
    /signature/,
  )
})
test('reference paint reconstructs accepted source bytes; arbitrary dyes preserve approved math', () => {
  assert.deepEqual(renderShipPixels(asset, request.colors), asset.source)
  const colors = { primary: '#f434bc', accent: '#e0f4ff' }
  const expected = renderFinish(
    asset.source,
    asset.material,
    { colors: Object.values(colors) },
    { responseMap: asset.response },
  )
  assert.deepEqual(renderShipPixels(asset, colors), expected)
})
test('paint and real texture application preserve alpha and protected glass/emission', () => {
  const texture = {
    width: 2,
    height: 2,
    pixels: new Uint8ClampedArray([
      245, 27, 86, 255, 245, 27, 86, 255, 245, 27, 86, 255, 245, 27, 86, 255,
    ]),
  }
  const hull = renderShipPixels(asset, {
    primary: '#000000',
    accent: '#ffffff',
  })
  const near = renderShipPixels(
    asset,
    { primary: '#000000', accent: '#ffffff' },
    { texture, treatment: 'layers', placement: 'near-wing' },
  )
  const paired = renderShipPixels(
    asset,
    { primary: '#000000', accent: '#ffffff' },
    { texture, treatment: 'layers', placement: 'paired' },
  )
  let nearChanges = 0,
    farChanges = 0,
    protectedCount = 0
  for (let p = 0; p < hull.length; p += 4) {
    assert.equal(paired[p + 3], asset.source[p + 3])
    if (!asset.material[p + 3]) {
      for (let c = 0; c < 3; c++)
        assert.equal(paired[p + c], asset.source[p + c])
      protectedCount++
    }
    if (near[p] !== hull[p]) nearChanges++
    if (paired[p] !== near[p]) farChanges++
  }
  assert.ok(protectedCount > 1000)
  assert.ok(nearChanges > 1000)
  assert.ok(farChanges > 1000)
})
test('missing fields, executable inputs, unbounded layers and unresolved named dyes fail closed', () => {
  assert.equal(validateRequest(request), request)
  validateAppearance(appearance)
  for (const change of [
    { version: 2 },
    { package_id: undefined },
    { package_id: '../secret' },
    { colors: { primary: 'url(http://x)', accent: '#ffffff' } },
    { shader: 'evil' },
    { request_id: 'not-uuid' },
  ])
    assert.throws(() => validateRequest({ ...request, ...change }))
  for (const url of [
    'http://169.254.169.254/latest/meta-data',
    'file:///tmp/private',
    '//evil.test' + reference,
    reference + '?redirect=yes',
    '/api/media/insignias/x/%2e%2e.svg',
  ])
    assert.throws(() => validateAppearance({ ...appearance, asset_url: url }))
  assert.throws(
    () => validateAppearance({ ...appearance, rendering: undefined }),
    /authoritative/,
  )
  assert.throws(
    () => validateAppearance({ ...appearance, layers: Array(5).fill({}) }),
    /layers/,
  )
  assert.throws(
    () =>
      validateManifest({
        ...asset.manifest,
        slots: [
          {
            id: 'near-wing',
            quad: [
              [0, 0],
              [1, 1],
              [0, 1],
              [1, 0],
            ],
          },
        ],
      }),
    /Degenerate/,
  )
})
test('installed originals are hash verified; remote origins and active SVG cannot enter rasterizer', async () => {
  const embedded = await resolveEmblemAssets(
    appearance,
    originals,
    assetConfig({}),
    new AbortController().signal,
  )
  assert.ok(embedded[reference].startsWith('data:image/svg+xml;base64,'))
  await assert.rejects(
    checkedAssetBytes(Buffer.from('<svg/>'), reference),
    /hash mismatch/,
  )
  await assert.rejects(
    resolveEmblemAssets(
      { ...appearance, asset_url: 'https://attacker.test' + reference },
      originals,
      assetConfig({}),
      new AbortController().signal,
    ),
    /Untrusted/,
  )
  await assert.rejects(
    resolveEmblemAssets(
      {
        ...appearance,
        asset_url: reference.replace(/[a-f0-9]{64}/, '0'.repeat(64)),
      },
      originals,
      assetConfig({}),
      new AbortController().signal,
    ),
    /not installed/,
  )
  assert.throws(() =>
    assetConfig({ ORBIT_SHIP_ASSET_ORIGIN: 'https://user:pass@assets.test/' }),
  )
  assert.ok(svg.length > 0)
  const active = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
  )
  const hash = createHash('sha256').update(active).digest('hex')
  await assert.rejects(
    checkedAssetBytes(active, `/api/media/insignias/fixture/${hash}.svg`),
    /Unsupported SVG/,
  )
  const namedLayers = {
    ...appearance,
    recipe: {
      ...appearance.recipe,
      layers: [{ symbol: 'compass', color: 'dye:navy' }],
    },
    layers: [{ symbol: 'compass', color: '#123456', asset_url: reference }],
  }
  validateAppearance(namedLayers)
  assert.throws(
    () =>
      validateAppearance({
        ...appearance,
        recipe: { ...appearance.recipe, foreground: 'not-a-dye' },
      }),
    /recipe color/,
  )
})
test('origin DNS policy excludes local, metadata, mapped and transition addresses', () => {
  for (const ip of [
    '127.0.0.1',
    '10.1.2.3',
    '169.254.169.254',
    '172.16.0.1',
    '192.168.1.1',
    '100.64.0.1',
    '::1',
    '::ffff:127.0.0.1',
    'fc00::1',
    'fe80::1',
    '2002:7f00:1::',
  ])
    assert.equal(isPublicAddress(ip), false, ip)
  assert.equal(isPublicAddress('8.8.8.8'), true)
  assert.equal(isPublicAddress('2606:4700:4700::1111'), true)
})

test('data-only installed registry loads a second independently authored package and rejects caller paths', async () => {
  assert.deepEqual(packageSelection({}), [
    { id: 'orbit-light-fighter', revision: 'concord-v1' },
  ])
  for (const entries of [
    [{ id: '../escape', revision: 'v1' }],
    [{ id: 'fixture', revision: 'v1', path: '/etc' }],
    [
      { id: 'fixture', revision: 'v1' },
      { id: 'fixture', revision: 'v1' },
    ],
  ])
    assert.throws(() =>
      packageSelection({ ORBIT_SHIP_PACKAGES: JSON.stringify(entries) }),
    )
  const root = await mkdtemp(join(tmpdir(), 'ship-runtime-test-'))
  try {
    const directory = join(root, 'fixture-fighter', 'fixture-v1')
    await mkdir(directory, { recursive: true })
    const bytes = await sharp({
      create: { width: 2, height: 2, channels: 4, background: '#123456' },
    })
      .png()
      .toBuffer()
    const map = {
      file: 'map.png',
      bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    }
    const manifest = {
      ...asset.manifest,
      id: 'fixture-fighter',
      revision: 'fixture-v1',
      target: { kind: 'Defense', id: 'RocketLauncher' },
      width: 2,
      height: 2,
      maps: Object.fromEntries(
        ['source', 'material', 'response', 'receiver', 'decalResponse'].map(
          (key) => [key, map],
        ),
      ),
      slots: [
        {
          id: 'near-wing',
          quad: [
            [0, 0],
            [2, 0],
            [2, 2],
            [0, 2],
          ],
        },
      ],
    }
    await writeFile(join(directory, 'map.png'), bytes)
    await writeFile(join(directory, 'manifest.json'), JSON.stringify(manifest))
    const registry = await loadInstalledPackages({
      ORBIT_SHIP_PACKAGE_DIRECTORY: root,
      ORBIT_SHIP_PACKAGES: '[{"id":"fixture-fighter","revision":"fixture-v1"}]',
    })
    assert.equal(registry.size, 1)
    const tiny = await registry.load('fixture-fighter/fixture-v1')
    tiny.source[3] = 0
    tiny.source[7] = 128
    const variants = await renderPixels(
      { asset: tiny, colors: request.colors, emblem: null },
      new AbortController().signal,
    )
    assert.deepEqual(
      variants.map((v) => v.mime_type),
      ['image/png', 'image/webp'],
    )
    for (const variant of variants) {
      assert.equal(variant.width, 2)
      assert.equal(variant.height, 2)
      const pixels = await sharp(Buffer.from(variant.data_base64, 'base64'))
        .ensureAlpha()
        .raw()
        .toBuffer()
      assert.deepEqual(
        [pixels[3], pixels[7], pixels[11], pixels[15]],
        [0, 128, 255, 255],
      )
    }

    assert.equal(renderShipPixels(tiny, request.colors).length, 16)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('registry supports a full fourteen-hull collection and bounds the configured revision count', () => {
  const entries = Array.from({ length: 32 }, (_, i) => ({
    id: `fixture-ship-${i}`,
    revision: 'v1',
  }))
  assert.equal(
    packageSelection({
      ORBIT_SHIP_PACKAGES: JSON.stringify(entries.slice(0, 14)),
    }).length,
    14,
  )
  assert.equal(
    packageSelection({ ORBIT_SHIP_PACKAGES: JSON.stringify(entries) }).length,
    32,
  )
  assert.throws(
    () =>
      packageSelection({
        ORBIT_SHIP_PACKAGES: JSON.stringify([
          ...entries,
          { id: 'overflow', revision: 'v1' },
        ]),
      }),
    /thirty-two/,
  )
})

test('fourteen native-resolution packages pass startup hashes, then load lazily against pinned manifests', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ship-collection-test-'))
  try {
    const bytes = await sharp({
      create: { width: 1536, height: 1024, channels: 4, background: '#123456' },
    })
      .png()
      .toBuffer()
    const map = {
      file: 'map.png',
      bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    }
    const entries = Array.from({ length: 14 }, (_, i) => ({
      id: `fixture-ship-${i}`,
      revision: 'v1',
    }))
    for (const entry of entries) {
      const directory = join(root, entry.id, entry.revision)
      await mkdir(directory, { recursive: true })
      await writeFile(join(directory, 'map.png'), bytes)
      await writeFile(
        join(directory, 'manifest.json'),
        JSON.stringify({
          ...asset.manifest,
          ...entry,
          maps: Object.fromEntries(
            Object.keys(asset.manifest.maps).map((key) => [key, map]),
          ),
        }),
      )
    }
    const env = {
      ORBIT_SHIP_PACKAGE_DIRECTORY: root,
      ORBIT_SHIP_PACKAGES: JSON.stringify(entries),
    }
    const registry = await loadInstalledPackages(env)
    assert.equal(registry.size, 14) // 22,020,096 native pixels; previously rejected.
    const selected = await registry.load('fixture-ship-13/v1')
    assert.equal(selected.source.length, 1536 * 1024 * 4)
    assert.deepEqual(Array.from(selected.source.slice(0, 4)), [18, 52, 86, 255])
    await assert.rejects(registry.load('../unlisted/v1'), /not installed/)
    const signal = AbortSignal.abort(Error('fixture cancellation'))
    await assert.rejects(
      registry.load('fixture-ship-0/v1', signal),
      /fixture cancellation/,
    )
    // A warm package may not hide an original changed after readiness.
    const damaged = Buffer.from(bytes)
    damaged[damaged.length - 1] ^= 1
    await writeFile(join(root, 'fixture-ship-13', 'v1', 'map.png'), damaged)
    await assert.rejects(registry.load('fixture-ship-13/v1'), /hash mismatch/)
    await assert.rejects(loadInstalledPackages(env), /hash mismatch/)
    await writeFile(join(root, 'fixture-ship-13', 'v1', 'map.png'), bytes)
    // Manifest swaps also cannot redefine a revision already pinned at startup.
    await writeFile(join(root, 'fixture-ship-13', 'v1', 'manifest.json'), '{}')
    const reloaded = await registry.load('fixture-ship-13/v1')
    assert.equal(reloaded.manifest.id, 'fixture-ship-13')
    assert.notEqual(reloaded.source, selected.source)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
