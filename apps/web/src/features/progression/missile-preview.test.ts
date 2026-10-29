import { expect, it } from 'vitest'
import { bootstrapFixture } from '../../test-support/bootstrap'
import { manufacturingPreview } from './manufacturing-preview'
import { technologyRequest } from './options'
import { catalogPage } from '../../shell/catalog-routes'
import { hasIncomingHostileFleet } from '../../client-model/hostile-fleets'
import { commandBody, matchesQuote } from '../../client-model/game-projection'
import type { BoundProgressionOptions } from '../../client-model/commands'
import type { components } from '../../contracts'
type S = components['schemas']
function fixture() {
  const b = bootstrapFixture(4)
  if (
    b.result.status !== 'authenticated' ||
    b.result.game.status !== 'ready' ||
    b.result.game.snapshot.view.protocol !== 4
  )
    throw Error('fixture')
  const view = b.result.game.snapshot.view
  const body: S['BodyV3'] = {
    id: 'home',
    kind: 'Planet',
    coordinates: { galaxy: 1, system: 1, position: 1 },
    amounts: { metal: '0', crystal: '0', deuterium: '0' },
    capacity: {
      metal: '100000000000',
      crystal: '100000000000',
      deuterium: '100000000000',
    },
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
      Shipyard: 1,
      MissileSilo: 4,
    },
    fields: 200,
    fields_used: 5,
    fields_reserved: 0,
    energy: { supply: '0', demand: '0', utilization: '1000000' },
    inventories: [],
  }
  view.bodies = [body]
  body.silo = { occupied: '38', reserved: '2', total: '40' }
  body.amounts = {
    metal: '100000000000',
    crystal: '100000000000',
    deuterium: '100000000000',
  }
  const item = {
    kind: 'Missile' as const,
    id: 'InterplanetaryMissile' as const,
  }
  const source: BoundProgressionOptions = {
    protocol: 4,
    binding: view.binding,
    request_id: view.request_id,
    viewer_revision: view.viewer_revision,
    sampled_at: view.sampled_at,
    as_of_ms: view.as_of_ms,
    request: { type: 'Manufacture', body: body.id, item, quantity: '1' },
    terms: {
      type: 'Manufacture',
      profile_hash: view.profile_hash,
      body: body.id,
      item,
      quantity: '1',
      silo_slots: 2,
      unit_cost: {
        metal: '12500000000',
        crystal: '2500000000',
        deuterium: '10000000000',
      },
      paid: {
        metal: '12500000000',
        crystal: '2500000000',
        deuterium: '10000000000',
      },
      unit_duration_ms: 60000,
      formula: 'ManufactureClassic',
      facilities: [],
    },
    terms_hash: 'b'.repeat(64),
    blockers: [],
    estimates: null,
  }
  return { view, body, item, source }
}
it('counts occupied and queued silo capacity using the quoted slot weight', () => {
  const { view, body, source } = fixture()
  expect(
    manufacturingPreview(source, view, '1')?.blockers.map((b) => b.code),
  ).toContain('CapacityReserved')
  body.silo!.occupied = '34'
  expect(manufacturingPreview(source, view, '2')?.blockers).toEqual([])
  expect(
    manufacturingPreview(source, view, '3')?.blockers.map((b) => b.code),
  ).toContain('CapacityReserved')
  if (source.terms?.type !== 'Manufacture') throw Error('terms')
  source.terms.silo_slots = 3
  expect(
    manufacturingPreview(source, view, '2')?.blockers.map((b) => b.code),
  ).toContain('CapacityReserved')
})
it('manufactures missiles through Defense and rejects invalid quantities', () => {
  const { item, body } = fixture()
  expect(catalogPage(item)).toBe('defense')
  expect(technologyRequest(item, body.id, 'Upgrade', '2')).toMatchObject({
    type: 'Manufacture',
    quantity: '2',
    item,
  })
  for (const n of ['0', '-1', '1.5', '9223372036854775808'])
    expect(technologyRequest(item, body.id, 'Upgrade', n)).toBeNull()
})
it('shows incoming missile warnings until the authoritative flight disappears', () => {
  const { view, body } = fixture()
  const flight: S['MissileFlightView4'] = {
    id: 'flight',
    attacker: 'enemy',
    origin: body.coordinates,
    target: body.coordinates,
    target_body: body.id,
    target_kind: 'Planet',
    count: '2',
    arrival_at: 0,
    outgoing: false,
  }
  view.missiles = [flight]
  view.missions.incoming = []
  expect(hasIncomingHostileFleet(view)).toBe(true)
  view.missiles = [{ ...flight, outgoing: true }]
  expect(hasIncomingHostileFleet(view)).toBe(false)
})
it('binds missile quotes and foreground gestures to the exact origin and target', () => {
  const { view, body } = fixture()
  const intent: S['MissileIntent4'] = {
    origin: body.id,
    target: {
      id: 'enemy-body',
      expected_owner: 'enemy',
      expected_kind: 'Planet',
    },
    count: '2',
    primary: null,
  }
  const quote: S['MissileTerms4'] = {
    intent,
    source_coordinates: body.coordinates,
    target_coordinates: body.coordinates,
    interceptor_body: 'enemy-body',
    distance: 0,
    range: 24,
    duration_ms: 6000,
    weapons: 0,
    speed: 5,
    rules: {
      version: 'oi-classic-missile-v1',
      slots_per_level: 10,
      abm_weight: 1,
      ipm_weight: 2,
      range_factor: 5,
      range_offset: -1,
      base_seconds: 30,
      seconds_per_system: 60,
      base_attack: 12000,
    },
    profile_hash: view.profile_hash,
    terms_hash: 'b'.repeat(64),
  }
  const command: S['Command4'] = {
    type: 'World',
    action: {
      type: 'LaunchMissiles',
      intent,
      expected_terms_hash: quote.terms_hash,
    },
  }
  expect(commandBody(command, view)).toBe(body.id)
  expect(matchesQuote(command, quote, view)).toBe(true)
  expect(
    matchesQuote(
      command,
      { ...quote, intent: { ...intent, count: '3' } },
      view,
    ),
  ).toBe(false)
  expect(matchesQuote(command, { ...quote, profile_hash: 'stale' }, view)).toBe(
    false,
  )
})
