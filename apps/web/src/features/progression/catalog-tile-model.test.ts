import { expect, it } from 'vitest'
import { catalogCostRequest, catalogUnaffordable } from './catalog-tile-model'
import {
  catalogCostContext,
  currentCatalogCost,
  type ProgressionRequest,
} from './options'
import { progressionFixture } from './progression-test-fixture'

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
    expect(catalogCostRequest(request, {})).toEqual(request)
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
      { progress: { status: 'In progress' } },
    ]) {
      expect(catalogCostRequest(request, tile)).toBeNull()
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
  expect(catalogCostRequest(request, { progress: {} })).toBeNull()
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
