import { describe, expect, it } from 'vitest'
import type {
  ShipAppearanceState,
  ShipEquipment,
  ShipRenderStage,
} from '../../client-model/ship-appearance-types'
import { resolveCatalogArt } from '../../ui/artwork'
import {
  canCustomizeShip,
  resolveShipAppearanceArt,
  shipAppearancesForOwner,
} from './ship-appearance-art'

const key = { kind: 'Ship', id: 'LightFighter' } as const
const binding = {
  account: 'account',
  player: 'player',
  universe: 'universe',
  epoch: 'epoch',
}
const equipment: ShipEquipment = {
  target: 'LightFighter',
  revision: 4,
  design_id: 'design',
  design_revision: 2,
  render: {
    id: 'request',
    stage: 'ready',
    can_cancel: false,
    can_retry: false,
  },
  artwork: {
    id: 'artifact',
    variants: [
      { width: 640, height: 480, url: '/api/art/large.webp' },
      { width: 96, height: 72, url: '/api/art/small.webp' },
      { width: 320, height: 240, url: '/api/art/medium.webp' },
    ],
  },
}
const snapshot: ShipAppearanceState = {
  binding,
  request_id: 'request',
  catalog: [
    {
      id: 'free-fighter',
      name: 'Fighter',
      target: 'LightFighter',
      package_revision: 'revision',
      package_url: '/skin.json',
      preview_url: '/preview.webp',
      available: true,
    },
  ],
  dyes: [],
  library: [],
  equipment: [equipment],
  emblem: null,
  emblem_revision: 0,
}

describe('ship appearance display', () => {
  it('chooses size variants without mutating the observation', () => {
    expect(resolveShipAppearanceArt(key, [equipment])).toEqual({
      key: 'ship-appearance:artifact',
      src: '/api/art/large.webp',
      thumbnail: '/api/art/small.webp',
      srcSet:
        '/api/art/small.webp 96w, /api/art/medium.webp 320w, /api/art/large.webp 640w',
      width: 640,
      height: 480,
    })
    expect(equipment.artwork?.variants[0].width).toBe(640)
  })

  it.each<ShipRenderStage>([
    'queued',
    'rendering',
    'preparing',
    'failed',
    'superseded',
    'canceled',
  ])('retains usable prior artwork during %s', (stage) => {
    expect(
      resolveShipAppearanceArt(key, [
        { ...equipment, render: { ...equipment.render!, stage } },
      ]).src,
    ).toBe('/api/art/large.webp')
  })

  it('uses catalog art while loading, without equipment, or without a usable output', () => {
    for (const value of [
      undefined,
      [],
      [{ ...equipment, artwork: null }],
      [{ ...equipment, artwork: { id: 'broken', variants: [] } }],
    ]) {
      expect(resolveShipAppearanceArt(key, value)).toEqual(
        resolveCatalogArt(key),
      )
    }
    expect(
      resolveShipAppearanceArt(key, [
        {
          ...equipment,
          artwork: {
            id: 'invalid',
            variants: [{ width: 0, height: 100, url: '/bad' }],
          },
        },
      ]),
    ).toEqual(resolveCatalogArt(key))
  })

  it('never applies fighter equipment to another craft or another catalog kind', () => {
    const cruiser = { kind: 'Ship', id: 'Cruiser' } as const
    const shipyard = { kind: 'Building', id: 'Shipyard' } as const
    expect(resolveShipAppearanceArt(cruiser, [equipment])).toEqual(
      resolveCatalogArt(cruiser),
    )
    expect(
      resolveShipAppearanceArt(shipyard, [
        { ...equipment, target: 'Shipyard' },
      ]),
    ).toEqual(resolveCatalogArt(shipyard))
  })

  it.each(['account', 'player', 'universe', 'epoch'] as const)(
    'rejects an appearance from a different %s',
    (field) => {
      expect(
        shipAppearancesForOwner(snapshot, { ...binding, [field]: 'other' }),
      ).toBeNull()
    },
  )

  it('accepts only the complete current owner binding', () => {
    expect(shipAppearancesForOwner(snapshot, { ...binding })).toBe(snapshot)
    expect(shipAppearancesForOwner(null, binding)).toBeNull()
  })

  it('offers customization only for an available installed skin on the target', () => {
    expect(canCustomizeShip(snapshot, 'LightFighter')).toBe(true)
    expect(canCustomizeShip(snapshot, 'Cruiser')).toBe(false)
    expect(canCustomizeShip(null, 'LightFighter')).toBe(false)
    expect(canCustomizeShip({ ...snapshot, catalog: [] }, 'LightFighter')).toBe(
      false,
    )
    expect(
      canCustomizeShip(
        {
          ...snapshot,
          catalog: [{ ...snapshot.catalog[0], available: false }],
        },
        'LightFighter',
      ),
    ).toBe(false)
  })
})
