import { expect, it, vi } from 'vitest'
import { readyFixture, id } from '../test-support/bootstrap'
import type { components } from '../contracts'
import type { Coordinator } from './coordinator'
import { createGameStore } from './game-store'
import {
  galaxyHarvest,
  harvestSuggestion,
  harvestCountError,
  sendGalaxyHarvest,
} from './galaxy-harvest'

type S = components['schemas']
const position = {
  coordinates: { galaxy: 1, system: 2, position: 3 },
  debris: { field_identity: id(30), metal: '40000', crystal: '1' },
}
function fixture(count = '5') {
  const view = readyFixture(4).snapshot.view as S['BoundView4']
  view.capabilities = [
    { capability: 'Harvest', enabled: true, reason: 'Available' },
  ]
  view.catalog = [
    {
      key: { kind: 'Ship', id: 'Recycler' },
      enabled: true,
      mobile: true,
      body_kinds: ['Planet'],
      requirements: [],
      ship_statistics: {
        combat: null,
        propulsion: {
          cargo_capacity: '20000',
          base_speed: '2000',
          fuel_consumption: '300',
          drive: 'CombustionDrive',
          impulse_upgrade: null,
        },
      },
    },
  ]
  view.bodies = [
    {
      id: id(10),
      kind: 'Planet',
      coordinates: { galaxy: 1, system: 1, position: 1 },
      amounts: { metal: '0', crystal: '0', deuterium: '1000000000' },
      capacity: { metal: '0', crystal: '0', deuterium: '1000000000' },
      levels: {
        MetalMine: 0,
        CrystalMine: 0,
        DeuteriumSynthesizer: 0,
        SolarPlant: 0,
        MetalStorage: 0,
        CrystalStorage: 0,
        DeuteriumTank: 0,
        RoboticsFactory: 0,
        ResearchLab: 0,
        Shipyard: 0,
      },
      fields: 163,
      fields_used: 0,
      fields_reserved: 0,
      energy: { supply: '0', demand: '0', utilization: '1000000' },
      inventories: [{ item: { kind: 'Ship', id: 'Recycler' }, count }],
    },
  ]
  const store = createGameStore()
  store.setState({ view, binding: view.binding, ready: true })
  const world = vi.fn<Coordinator['world']>(async (query) => {
    if (query.type !== 'FleetQuote') throw Error('Unexpected query')
    return {
      intent: query.intent,
      profile_hash: view.profile_hash,
      terms_hash: 'b'.repeat(64),
      distance: 1000,
      speeds: [['Recycler', '2000']],
      duration_ms: 3000,
      fuel: '1000000',
      capacity: '60000000000',
      maximum_payload: '60000000000',
      slot_limit: '1',
    }
  })
  const send = vi.fn<Coordinator['send']>().mockResolvedValue(id(50))
  return { store, world, send, view }
}
it('rounds up whole debris exactly and caps the suggestion by inventory', () => {
  expect(harvestSuggestion('20000', '0', '20000', '5')).toEqual({
    needed: '1',
    suggested: '1',
  })
  expect(harvestSuggestion('20000', '1', '20000', '5')).toEqual({
    needed: '2',
    suggested: '2',
  })
  expect(harvestSuggestion('40000', '1', '20000', '2')).toEqual({
    needed: '3',
    suggested: '2',
  })
  expect(harvestSuggestion('9007199254740993', '1', '20000', '100')).toEqual({
    needed: '450359962738',
    suggested: '100',
  })
  expect(harvestSuggestion('10000', '1', '10000', '5').needed).toBe('2')
  expect(harvestSuggestion('20000', '1', '40000', '5').needed).toBe('2')
  expect(harvestSuggestion('0', '0', '20000', '5').suggested).toBe('0')
})
it('derives the suggestion from the current selected planet and explains blockers independently', () => {
  const model = fixture()
  expect(galaxyHarvest(model.store.getState(), id(10), position)).toEqual({
    available: '5',
    needed: '3',
    suggested: '3',
    blockers: [],
  })
  model.view.bodies[0].inventories[0].count = '0'
  model.view.missions.fleet_slots = '0'
  expect(
    galaxyHarvest(model.store.getState(), id(10), position).blockers,
  ).toEqual([
    'No recyclers available on the selected planet.',
    'No fleet slots available. Wait for a fleet to return.',
  ])
  expect(
    galaxyHarvest(model.store.getState(), id(99), position).available,
  ).toBe('0')
})
it('rejects malformed, empty, zero and excessive edits without rounding', () => {
  for (const count of ['', '0', '-1', '1.5', '1e2', ' 2', '6'])
    expect(harvestCountError(count, '5')).not.toBeNull()
  expect(harvestCountError('5', '5')).toBeNull()
})
it('sends only recyclers, empty cargo and the exact debris identity after a fresh quote', async () => {
  const model = fixture()
  expect(
    await sendGalaxyHarvest(model, id(10), position, '3', () => true),
  ).toBe(id(50))
  expect(model.world).toHaveBeenCalledTimes(1)
  expect(model.send).toHaveBeenCalledWith(
    {
      type: 'World',
      action: {
        type: 'LaunchFleet',
        intent: {
          origin: id(10),
          destination: {
            type: 'Debris',
            coordinates: position.coordinates,
            field_identity: id(30),
          },
          mission: 'Harvest',
          ships: [
            {
              owner: model.view.binding.player,
              ship_type: 'Recycler',
              count: '3',
            },
          ],
          cargo: { metal: '0', crystal: '0', deuterium: '0' },
          speed_percent: 100,
        },
        expected_terms_hash: 'b'.repeat(64),
      },
    },
    expect.objectContaining({ terms_hash: 'b'.repeat(64) }),
  )
})
it('rechecks ships and fleet slots after the asynchronous quote', async () => {
  for (const change of ['ships', 'slots'] as const) {
    const model = fixture(),
      original = model.world.getMockImplementation()!
    model.world.mockImplementation(async (query) => {
      const terms = await original(query)
      if (change === 'ships') model.view.bodies[0].inventories[0].count = '1'
      else model.view.missions.fleet_slots = '0'
      return terms
    })
    await expect(
      sendGalaxyHarvest(model, id(10), position, '3', () => true),
    ).rejects.toThrow(
      change === 'ships' ? 'Not enough recyclers' : 'No fleet slots',
    )
    expect(model.send).not.toHaveBeenCalled()
  }
})
it('never launches a quote after closure, context change or a new binding', async () => {
  for (const change of ['closed', 'binding'] as const) {
    const model = fixture(),
      original = model.world.getMockImplementation()!
    let current = true
    model.world.mockImplementation(async (query) => {
      const terms = await original(query)
      if (change === 'closed') current = false
      else
        model.store.setState({
          binding: { ...model.view.binding, epoch: id(99) },
        })
      return terms
    })
    expect(
      await sendGalaxyHarvest(model, id(10), position, '3', () => current),
    ).toBeUndefined()
    expect(model.send).not.toHaveBeenCalled()
  }
})
it('server quote failures and unavailable local inventory never send', async () => {
  const model = fixture()
  model.world.mockRejectedValue(Error('InsufficientResources'))
  await expect(
    sendGalaxyHarvest(model, id(10), position, '3', () => true),
  ).rejects.toThrow()
  expect(model.send).not.toHaveBeenCalled()
  const empty = fixture('0')
  await expect(
    sendGalaxyHarvest(empty, id(10), position, '1', () => true),
  ).rejects.toThrow('No recyclers')
  expect(empty.world).not.toHaveBeenCalled()
})

it.each(['before', 'during'])(
  'leaves throttled harvest feedback to the banner when blocked %s sending',
  async (when) => {
    const model = fixture()
    model.store.setState({ rateLimited: when === 'before' })
    model.send.mockImplementation(async () => {
      model.store.setState({ rateLimited: true, stale: true })
      return undefined
    })
    await expect(
      sendGalaxyHarvest(model, id(10), position, '3', () => true),
    ).resolves.toBeUndefined()
    expect(model.send).toHaveBeenCalledTimes(when === 'before' ? 0 : 1)
    expect(
      galaxyHarvest(model.store.getState(), id(10), position).blockers,
    ).toEqual([])
  },
)

it('counts deuterium toward capacity and allows deuterium-only fields', () => {
  expect(
    harvestSuggestion('300000', '180000', '20000', '100', '60000'),
  ).toEqual({ needed: '27', suggested: '27' })
  const model = fixture()
  const deuteriumOnly = {
    ...position,
    debris: {
      ...position.debris,
      metal: '0',
      crystal: '0',
      deuterium: '40001',
    },
  }
  expect(galaxyHarvest(model.store.getState(), id(10), deuteriumOnly)).toEqual({
    available: '5',
    needed: '3',
    suggested: '3',
    blockers: [],
  })
})
