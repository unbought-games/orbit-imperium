/// <reference types="node" />
import { describe, expect, it } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import sharp from 'sharp'
import { fileURLToPath } from 'node:url'
import {
  resolveBodyArt,
  resolveCatalogArt,
  resolvePlanetArt,
  atmosphereArt,
} from './artwork'
import type { BodyArtIdentity, Artwork } from './artwork'
import type { components } from '../contracts'

const publicRoot = new URL('../../public/', import.meta.url)
const manifest = JSON.parse(
  readFileSync(new URL('art/atlas/manifest.json', publicRoot), 'utf8'),
)
const schema = JSON.parse(
  readFileSync(
    new URL('../../../../contracts/openapi.json', import.meta.url),
    'utf8',
  ),
).components.schemas
const body: BodyArtIdentity = {
  id: '00000000-0000-0000-0000-000000000004',
  kind: 'Planet',
  coordinates: { position: 4 },
}

function verifyDelivery(art: Artwork) {
  const entry = manifest.assets.find(
    (asset: { key: string }) => asset.key === art.key,
  )
  expect(entry, art.key).toBeDefined()
  const urls = [
    art.src,
    art.thumbnail,
    ...art.srcSet.split(', ').map((candidate) => candidate.split(' ')[0]!),
  ]
  for (const url of urls) {
    expect(existsSync(new URL(url.slice(1), publicRoot)), url).toBe(true)
    const variant = entry.variants.find((item: { path: string }) =>
      url.endsWith(`/${item.path}`),
    )
    expect(variant, url).toBeDefined()
  }
  expect(
    entry.variants.find((item: { path: string }) =>
      art.src.endsWith(`/${item.path}`),
    ),
  ).toMatchObject({ width: art.width, height: art.height })
}

describe('artwork identity', () => {
  it('assigns a distinct master to all fifteen slots across body references', () => {
    const keys = new Set<string>()
    for (let position = 1; position <= 15; position++) {
      const art = resolveBodyArt({ ...body, coordinates: { position } })
      expect(art).toEqual(resolvePlanetArt(position))
      keys.add(art.key)
      verifyDelivery(art)
    }
    expect(keys.size).toBe(15)
  })

  it('keeps identity through new object instances, roster reordering and unrelated metadata', () => {
    const roster = [
      body,
      { ...body, id: 'other', coordinates: { position: 12 } },
    ]
    const before = new Map(
      roster.map((item) => [item.id, resolveBodyArt(item)]),
    )
    for (const item of [...roster].reverse()) {
      expect(resolveBodyArt({ ...item })).toEqual(before.get(item.id))
    }
  })

  it('uses stable moon IDs independently of planet slots and preserves UUID casing equivalence', () => {
    const moon = {
      ...body,
      id: 'A0000000-0000-0000-0000-000000000004',
      kind: 'Moon' as const,
    }
    const art = resolveBodyArt(moon)
    expect(art.key).toMatch(/^moon-0[123]$/)
    expect(art.key).not.toBe(resolveBodyArt(body).key)
    expect(
      resolveBodyArt({
        ...moon,
        id: moon.id.toLowerCase(),
        coordinates: { position: 15 },
      }),
    ).toEqual(art)
    const variants = new Set<string>()
    for (let index = 0; index < 30; index++) {
      const candidate = resolveBodyArt({ ...moon, id: `moon-${index}` })
      variants.add(candidate.key)
      verifyDelivery(candidate)
    }
    expect(variants.size).toBe(3)
  })

  it('uses the copper fallback only for invalid or unknown slot inputs', () => {
    for (const position of [0, -1, 16, NaN, Infinity, 4.5]) {
      expect(resolvePlanetArt(position)).toEqual(resolvePlanetArt(4))
    }
  })
})

describe('published catalog coverage', () => {
  it('ships decodable derivatives with the declared dimensions and alpha', async () => {
    for (const asset of manifest.assets) {
      for (const variant of asset.variants) {
        const path = new URL(`art/atlas/${variant.path}`, publicRoot)
        const metadata = await sharp(fileURLToPath(path)).metadata()
        expect(metadata, variant.path).toMatchObject({
          format: 'webp',
          width: variant.width,
          height: variant.height,
          hasAlpha: variant.alpha,
        })
      }
    }
  })

  it('delivers every contract catalog key, including locked content and missiles', () => {
    for (const [kind, enumName] of Object.entries({
      Building: 'BuildingId3',
      Research: 'ResearchId3',
      Ship: 'ShipId3',
      Defense: 'DefenseId3',
      Missile: 'MissileId',
    })) {
      for (const id of schema[enumName].enum) {
        verifyDelivery(
          resolveCatalogArt({
            kind,
            id,
          } as components['schemas']['CatalogKey3']),
        )
      }
    }
  })

  it('publishes unique logical keys and preserves native sources and delivery metadata', () => {
    expect(
      new Set(manifest.assets.map((asset: { key: string }) => asset.key)).size,
    ).toBe(manifest.assets.length)
    for (const asset of manifest.assets) {
      expect(
        existsSync(new URL(`art/atlas/${asset.master}`, publicRoot)),
        asset.master,
      ).toBe(true)
      expect(asset.sha256).toMatch(/^[a-f0-9]{64}$/)
      expect(asset.dimensions.width).toBeGreaterThan(0)
      expect(asset.dimensions.height).toBeGreaterThan(0)
      for (const variant of asset.variants)
        expect(variant.bytes).toBeGreaterThan(0)
    }
    expect(existsSync(new URL(atmosphereArt.src.slice(1), publicRoot))).toBe(
      true,
    )
  })
})
