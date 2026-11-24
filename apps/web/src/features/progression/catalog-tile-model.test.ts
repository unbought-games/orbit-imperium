import { expect, it } from 'vitest'
import {
  catalogPreview,
  catalogPreviewRequest,
  catalogUnaffordable,
} from './catalog-tile-model'
import {
  catalogCostContext,
  currentCatalogCost,
  type ProgressionRequest,
} from './options'
import { progressionFixture } from './progression-test-fixture'
import { productionFixture } from '../../test-support/production'

const requests: ProgressionRequest[] = [
  { type: 'Upgrade', body: 'planet', building: 'RoboticsFactory' },
  { type: 'Research', host: 'planet', research: 'EnergyTechnology' },
  {
    type: 'Manufacture',
    body: 'planet',
    item: { kind: 'Ship', id: 'SmallCargo' },
    quantity: '1',
  },
  {
    type: 'Manufacture',
    body: 'planet',
    item: { kind: 'Defense', id: 'SmallShieldDome' },
    quantity: '1',
  },
]
for (const request of requests) {
  it(`${request.type} ${'item' in request ? request.item.kind : ''} derives exact live hatching without changing the cost key`, () => {
    const { view } = progressionFixture()
    const cost = {
      metal: '60000000',
      crystal: '15000000',
      deuterium: '10000000',
    }
    const key = catalogCostContext(view, request)
    expect(catalogPreviewRequest(request, {})).toEqual(request)
    for (const resource of ['metal', 'crystal', 'deuterium'] as const) {
      view.bodies[0].amounts = {
        ...cost,
        [resource]: (BigInt(cost[resource]) - 1n).toString(),
      }
      expect(catalogUnaffordable(view, request, cost)).toBe(true)
      view.bodies[0].amounts[resource] = cost[resource]
      expect(catalogUnaffordable(view, request, cost)).toBe(false)
      expect(catalogCostContext(view, request)).toBe(key)
    }
    for (const tile of [
      { disabled: true },
      { locked: true },
      { progress: {} },
    ]) {
      expect(catalogPreviewRequest(request, tile)).toBeNull()
      expect(catalogUnaffordable(view, request, null)).toBe(false)
    }
    const other = { ...view.bodies[0], id: 'other', amounts: { ...cost } }
    view.bodies[0].amounts.metal = '59999999'
    view.bodies.unshift(other)
    expect(catalogUnaffordable(view, request, cost)).toBe(true)
    view.bodies.pop()
    expect(catalogUnaffordable(view, request, cost)).toBe(false)
    expect(catalogUnaffordable(view, null, cost)).toBe(false)
  })
}

it('suppresses hatching while research is active and rejects the completed level cost', () => {
  const { view, source } = progressionFixture()
  const request = {
    type: 'Research',
    host: 'planet',
    research: 'EnergyTechnology',
  } as const
  const quote = {
    ...source,
    request,
    terms: {
      type: 'Research' as const,
      profile_hash: view.profile_hash,
      host: 'planet',
      research: 'EnergyTechnology' as const,
      source_level: 1,
      target_level: 2,
      paid: { metal: '60000000', crystal: '15000000', deuterium: '10000000' },
      duration_ms: 60000,
      formula: 'ResearchClassic' as const,
      labs: [],
      effective_lab: '1',
      required_energy: '0',
    },
  }
  view.research = [{ research: 'EnergyTechnology', level: 1 }]
  view.bodies[0].amounts.metal = '59999999'
  expect(
    catalogUnaffordable(view, request, currentCatalogCost(quote, view)),
  ).toBe(true)
  expect(catalogPreviewRequest(request, { progress: {} })).toBeNull()
  const before = catalogCostContext(view, request)
  view.research[0].level = 2
  expect(catalogCostContext(view, request)).not.toBe(before)
  expect(currentCatalogCost(quote, view)).toBeNull()
  const next = {
    ...quote,
    terms: {
      ...quote.terms,
      source_level: 2,
      target_level: 3,
      paid: { ...quote.terms.paid, metal: '120000000' },
    },
  }
  view.bodies[0].amounts.metal = '60000000'
  expect(
    catalogUnaffordable(view, request, currentCatalogCost(next, view)),
  ).toBe(true)
  view.bodies[0].amounts.metal = '120000000'
  expect(
    catalogUnaffordable(view, request, currentCatalogCost(next, view)),
  ).toBe(false)
})

it('previews the added mine demand at saved output and discards a stale level quote', () => {
  const { view, source } = progressionFixture()
  const body = view.bodies[0]
  const production = productionFixture(body)
  production.energy_demand = '30000000'
  production.energy_supply = '73000000'
  view.progression.production = [production]
  const request = {
    type: 'Upgrade',
    body: body.id,
    building: 'MetalMine',
  } as const
  const cost = { metal: '60000000', crystal: '15000000', deuterium: '0' }
  const proposal = {
    ...source,
    request,
    terms: {
      type: 'Building' as const,
      profile_hash: view.profile_hash,
      body: body.id,
      building: request.building,
      action: request.type,
      source_level: 1,
      target_level: 2,
      paid: cost,
      duration_ms: 30000,
      formula: 'BuildingRedesign2011' as const,
      facilities: [],
      required_energy: '0',
      reserve_fields: 1,
    },
    building_energy: {
      current_consumption: '11000000',
      target_consumption: '24200000',
    },
  }
  expect(catalogPreview(view, proposal)).toEqual({
    cost,
    energyDemand: 13200000n,
  })
  production.settings.metal_mine = 50
  expect(catalogPreview(view, proposal).energyDemand).toBe(6600000n)
  production.settings.metal_mine = 0
  expect(catalogPreview(view, proposal).energyDemand).toBe(0n)
  expect(
    catalogPreview(view, { ...proposal, building_energy: undefined }),
  ).toEqual({
    cost,
    energyDemand: null,
  })
  body.levels.MetalMine = 2
  expect(catalogPreview(view, proposal)).toEqual({
    cost: null,
    energyDemand: null,
  })
})

it('requests demand for an active mine upgrade to the displayed target', () => {
  const request = {
    type: 'Upgrade',
    body: 'planet',
    building: 'DeuteriumSynthesizer',
  } as const
  expect(
    catalogPreviewRequest(request, {
      level: 14,
      progress: { direction: 'up', targetLevel: 15 },
    }),
  ).toBe(request)
  expect(
    catalogPreviewRequest(request, {
      level: 14,
      progress: { direction: 'down', targetLevel: 13 },
    }),
  ).toBeNull()
  expect(
    catalogPreviewRequest(request, {
      level: 14,
      progress: { direction: 'up', targetLevel: 16 },
    }),
  ).toBeNull()
})
