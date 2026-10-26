import type { components } from '../../contracts'
import { fleetInventoryRows } from '../fleet-inventory-model'
import { unitCounts } from './unit-counts'
import { expect, it } from 'vitest'
import type { BoundProgressionOptions } from '../../client-model/commands'
import type { ProgressionProps } from './shared'
import {
  manufacturingPreview,
  matchesManufacturingPreview,
} from './manufacturing-preview'
import {
  manufacturingQueue,
  formatQueueCountdown,
} from '../../client-model/manufacturing-queue'
import {
  currentProgressionOptions,
  progressionContext,
  buildingCostContext,
  currentBuildingCost,
  technologyRequest,
} from './options'

const body: ProgressionProps['body'] = {
  id: 'planet',
  kind: 'Planet',
  coordinates: { galaxy: 1, system: 1, position: 1 },
  amounts: { metal: '0', crystal: '20', deuterium: '0' },
  capacity: { metal: '1000', crystal: '1000', deuterium: '1000' },
  levels: {
    MetalMine: 1,
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
  fields: 10,
  fields_used: 1,
  fields_reserved: 0,
  energy: { supply: '0', demand: '0', utilization: '1000000' },
  inventories: [],
}
const view: ProgressionProps['view'] = {
  protocol: 3,
  binding: {
    account: 'account',
    player: 'player',
    universe: 'universe',
    epoch: 'epoch',
  },
  request_id: 'request',
  viewer_revision: '1',
  sampled_at: 1000,
  as_of_ms: 1000,
  speed: 1,
  profile_hash: 'profile',
  bodies: [body],
  research: [],
  catalog: [],
  capabilities: [],
  constructions: [],
  fleets: [],
  reports: [],
  destinations: [],
  reports_truncated: false,
  destinations_truncated: false,
  progression: {
    production: [],
    research_operation: null,
    manufacturing: [],
    limits: { max_active_manufacturing_entries: 256 },
  },
}
const proposal: BoundProgressionOptions = {
  protocol: 3,
  binding: view.binding,
  request_id: 'quote',
  viewer_revision: '1',
  sampled_at: 1000,
  as_of_ms: 1000,
  request: { type: 'Upgrade', body: 'planet', building: 'MetalMine' },
  terms_hash: 'hash',
  estimates: null,
  terms: {
    type: 'Building',
    profile_hash: 'profile',
    body: 'planet',
    building: 'MetalMine',
    action: 'Upgrade',
    source_level: 1,
    target_level: 2,
    paid: { metal: '60', crystal: '15', deuterium: '0' },
    duration_ms: 1000,
    formula: 'BuildingRedesign2011',
    facilities: [],
    required_energy: '0',
    reserve_fields: 1,
  },
  blockers: [
    {
      code: 'InsufficientResources',
      requirement: null,
      required: '60',
      actual: '0',
      resource: 'Metal',
      unit: 'MicroResource',
    },
  ],
}

function unitOptions(): BoundProgressionOptions {
  return {
    ...proposal,
    request: {
      type: 'Manufacture',
      body: body.id,
      item: { kind: 'Ship', id: 'SmallCargo' },
      quantity: '1',
    },
    blockers: [],
    terms: {
      type: 'Manufacture',
      body: body.id,
      item: { kind: 'Ship', id: 'SmallCargo' },
      quantity: '1',
      profile_hash: view.profile_hash,
      paid: { metal: '60000000', crystal: '15000000', deuterium: '0' },
      unit_cost: { metal: '60000000', crystal: '15000000', deuterium: '0' },
      unit_duration_ms: 30000,
      formula: 'ManufactureClassic',
      facilities: [],
    },
  }
}

it.each([
  ['Queued', '12 seconds remaining', 'Starts in 12 seconds'],
  ['Producing', '12 seconds remaining', 'Next unit: 12 seconds remaining'],
  ['Queued', 'Awaiting confirmation', 'Awaiting confirmation'],
  ['Producing', 'Awaiting confirmation', 'Awaiting confirmation'],
])('formats %s manufacturing countdown %s', (status, countdown, expected) => {
  expect(formatQueueCountdown(status, countdown)).toBe(expected)
})

it('derives exact manufacturing cost, duration and live affordability without mutating unit terms', () => {
  const source = unitOptions()
  const current = structuredClone(view)
  current.bodies[0].amounts = {
    metal: '180000000',
    crystal: '45000000',
    deuterium: '0',
  }
  const preview = manufacturingPreview(source, current, '3')!
  expect(preview.terms.paid).toEqual(current.bodies[0].amounts)
  expect(preview.estimates?.final_due_at).toBe(current.sampled_at + 90000)
  expect(preview.blockers).toEqual([])
  expect(preview).not.toHaveProperty('terms_hash')
  current.bodies[0].amounts.metal = '179999999'
  expect(manufacturingPreview(source, current, '3')?.blockers).toMatchObject([
    {
      code: 'InsufficientResources',
      required: '180000000',
      actual: '179999999',
    },
  ])
  expect(source.terms).toMatchObject({
    quantity: '1',
    paid: { metal: '60000000' },
  })
  expect(manufacturingPreview(source, current, '0')).toBeNull()
})

it.each([
  ['179999999', true],
  ['180000000', false],
  ['180000001', false],
])('uses exact manufacturing balances at %s micro metal', (metal, blocked) => {
  const source = unitOptions()
  const current = structuredClone(view)
  current.bodies[0].amounts = { metal, crystal: '45000000', deuterium: '0' }
  const preview = manufacturingPreview(source, current, '3')!
  const validated = {
    ...source,
    request: preview.request,
    terms: preview.terms,
  }
  expect(preview.blockers.length > 0).toBe(blocked)
  expect(currentProgressionOptions(validated, current)?.blockers).toEqual(
    preview.blockers,
  )
  expect(manufacturingPreview(source, current, '2')?.blockers).toEqual([])
  expect(
    manufacturingPreview(source, current, '4')?.blockers.length,
  ).toBeGreaterThan(0)
})

it('blocks numeric overflow and shield dome capacity locally', () => {
  const source = unitOptions()
  expect(
    manufacturingPreview(source, view, '9223372036854775807')?.blockers.map(
      (b) => b.code,
    ),
  ).toContain('NumericRange')
  if (source.terms?.type !== 'Manufacture') throw Error('fixture')
  source.terms.item = { kind: 'Defense', id: 'SmallShieldDome' }
  expect(
    manufacturingPreview(source, view, '2')?.blockers.map((b) => b.code),
  ).toContain('CapacityReserved')
  expect(
    manufacturingPreview(source, view, '1')?.blockers.map((b) => b.code),
  ).not.toContain('CapacityReserved')
})

it('requires server validation to match the displayed quantity, cost and production time', () => {
  const source = unitOptions()
  const preview = manufacturingPreview(source, view, '3')!
  const validated = {
    ...source,
    request: preview.request,
    terms: preview.terms,
  }
  expect(matchesManufacturingPreview(preview, validated)).toBe(true)
  expect(matchesManufacturingPreview(preview, source)).toBe(false)
  expect(
    matchesManufacturingPreview(preview, {
      ...validated,
      terms: { ...preview.terms, unit_duration_ms: 40000 },
    }),
  ).toBe(false)
})

it('orders all ships and defenses together and appends pending orders for the selected body', () => {
  const current = structuredClone(view)
  const batch = {
    id: 'active',
    body: body.id,
    item: { kind: 'Ship' as const, id: 'SmallCargo' as const },
    quantity: '3',
    completed_prefix: '1',
    remaining: '2',
    paid: body.amounts,
    accepted_at: 100,
    first_start_at: 1000,
    next_due_at: 2000,
    final_due_at: 3000,
    unit_duration_ms: 1000,
    state: 'Producing' as const,
    can_cancel: false as const,
  }
  current.progression.manufacturing = [
    {
      ...batch,
      id: 'queued-defense',
      item: { kind: 'Defense', id: 'RocketLauncher' },
      first_start_at: 3000,
      state: 'PaidQueued',
    },
    { ...batch, id: 'other-body', body: 'other' },
    batch,
  ]
  const terms = unitOptions().terms!
  if (terms.type !== 'Manufacture') throw Error('fixture')
  const rows = manufacturingQueue(current, body.id, [
    {
      commandId: 'pending',
      operationId: null,
      terms,
      status: 'submitting',
      submittedAt: 1500,
    },
  ])
  expect(rows.map((row) => row.id)).toEqual([
    'active',
    'queued-defense',
    'pending',
  ])
  expect(rows.map((row) => row.status)).toEqual([
    'Producing',
    'Queued',
    'Confirming',
  ])
  expect(rows.map((row) => row.due)).toEqual([2000, 3000, undefined])
  expect(current.progression.manufacturing[0].id).toBe('queued-defense')
})

it('keeps building cost inputs stable across queues but invalidates changed levels, subjects and profiles', () => {
  const current = structuredClone(view)
  const original = buildingCostContext(view, proposal.request)
  current.bodies[0].fields_reserved = 1
  current.bodies[0].amounts.metal = '999'
  current.constructions.push({
    id: 'work',
    body: 'planet',
    building: 'SolarPlant',
    target_level: 1,
    due_at: 2000,
    paid: { metal: '1', crystal: '0', deuterium: '0' },
  })
  expect(buildingCostContext(current, proposal.request)).toBe(original)
  expect(currentBuildingCost(proposal, current)).toEqual({
    metal: '60',
    crystal: '15',
    deuterium: '0',
  })
  current.bodies[0].levels.MetalMine = 2
  expect(buildingCostContext(current, proposal.request)).not.toBe(original)
  expect(currentBuildingCost(proposal, current)).toBeNull()
  current.bodies[0].levels.MetalMine = 1
  current.profile_hash = 'new-profile'
  expect(currentBuildingCost(proposal, current)).toBeNull()
  current.profile_hash = view.profile_hash
  current.binding.epoch = 'new-epoch'
  expect(currentBuildingCost(proposal, current)).toBeNull()
  expect(
    buildingCostContext(view, {
      type: 'Upgrade',
      body: 'other',
      building: 'MetalMine',
    }),
  ).not.toBe(original)
})

it('replaces stale resource blockers using only the quote subject balances and retains other blockers', () => {
  const current = structuredClone(view)
  current.bodies[0].amounts.metal = '59'
  expect(currentProgressionOptions(proposal, current)?.blockers[0].actual).toBe(
    '59',
  )
  current.bodies[0].amounts.metal = '60'
  expect(currentProgressionOptions(proposal, current)?.blockers).toEqual([])
  const blocked: BoundProgressionOptions = {
    ...proposal,
    blockers: [
      ...proposal.blockers,
      {
        code: 'NoFreeField',
        requirement: null,
        required: null,
        actual: null,
        resource: null,
        unit: null,
      },
    ],
  }
  expect(
    currentProgressionOptions(blocked, current)?.blockers.map((b) => b.code),
  ).toEqual(['NoFreeField'])
  current.bodies.unshift({
    ...body,
    id: 'other',
    amounts: { ...body.amounts, metal: '1000000' },
  })
  current.bodies[1].amounts.metal = '0'
  expect(currentProgressionOptions(proposal, current)?.blockers[0].actual).toBe(
    '0',
  )
  expect(proposal.blockers[0].actual).toBe('0')
  expect(
    currentProgressionOptions(proposal, { ...view, bodies: [] }),
  ).toBeNull()
})

it('preserves resource blockers when the server cannot provide priced terms', () => {
  const unavailable = { ...proposal, terms: null, terms_hash: null }
  expect(currentProgressionOptions(unavailable, view)?.blockers).toEqual(
    proposal.blockers,
  )
})

it('keeps quotes on income and timestamp updates but invalidates structural changes', () => {
  const current = structuredClone(view)
  current.bodies[0].amounts.metal = '100'
  current.as_of_ms += 2000
  current.viewer_revision = '2'
  expect(progressionContext(current)).toBe(progressionContext(view))
  current.bodies[0].levels.MetalMine = 2
  expect(progressionContext(current)).not.toBe(progressionContext(view))
  current.bodies[0].levels.MetalMine = 1
  current.research = [{ research: 'EnergyTechnology', level: 1 }]
  expect(progressionContext(current)).not.toBe(progressionContext(view))
  current.research = []
  current.bodies[0].fields_reserved = 1
  expect(progressionContext(current)).not.toBe(progressionContext(view))
})

it.each(['0', '-1', '1.2', '', '01', '9223372036854775808'])(
  'rejects invalid manufacturing quantity %s',
  (quantity) => {
    expect(
      technologyRequest(
        { kind: 'Ship', id: 'SmallCargo' },
        'planet',
        'Upgrade',
        quantity,
      ),
    ).toBeNull()
  },
)

it('binds valid quantities, research hosts, and demolition subjects exactly', () => {
  expect(
    technologyRequest(
      { kind: 'Ship', id: 'SmallCargo' },
      'planet',
      'Upgrade',
      '9223372036854775807',
    ),
  ).toEqual({
    type: 'Manufacture',
    body: 'planet',
    item: { kind: 'Ship', id: 'SmallCargo' },
    quantity: '9223372036854775807',
  })
  expect(
    technologyRequest(
      { kind: 'Research', id: 'EnergyTechnology' },
      'planet',
      'Upgrade',
      '1',
    ),
  ).toEqual({ type: 'Research', host: 'planet', research: 'EnergyTechnology' })
  expect(
    technologyRequest(
      { kind: 'Building', id: 'MetalMine' },
      'planet',
      'Demolition',
      '1',
    ),
  ).toEqual({ type: 'Demolition', body: 'planet', building: 'MetalMine' })
})

it('unit counts keep exact confirmed orders separate by body and item', () => {
  const entry = {
    key: { kind: 'Ship', id: 'SmallCargo' },
    enabled: true,
    mobile: true,
    body_kinds: ['Planet'],
    requirements: [],
  } as const
  const item = { kind: 'Ship', id: 'SmallCargo' } as const
  const batch = {
    id: 'batch',
    body: body.id,
    item,
    quantity: '9007199254740993',
    completed_prefix: '1',
    remaining: '9007199254740992',
    paid: body.amounts,
    accepted_at: 0,
    first_start_at: 0,
    next_due_at: 1000,
    final_due_at: 2000,
    unit_duration_ms: 1000,
    state: 'Producing',
    can_cancel: false,
  } as const
  const current = {
    ...view,
    progression: {
      ...view.progression,
      manufacturing: [
        batch,
        { ...batch, id: 'other', body: 'other' },
        {
          ...batch,
          id: 'defense',
          item: { kind: 'Defense', id: 'RocketLauncher' } as const,
        },
      ],
    },
  }
  const result = unitCounts(
    current,
    { ...body, inventories: [{ item, count: '9007199254740995' }] },
    { ...entry, body_kinds: ['Planet'], requirements: [] },
  )
  expect(result).toEqual({
    stationed: '9007199254740995',
    ordered: '9007199254740992',
    flying: '0',
  })
})

it('does not invent flying counts for stationary units or unavailable legacy manifests', () => {
  for (const key of [
    { kind: 'Defense', id: 'RocketLauncher' },
    { kind: 'Ship', id: 'SolarSatellite' },
    { kind: 'Ship', id: 'LightFighter' },
  ] as const) {
    const result = unitCounts(view, body, {
      key,
      enabled: true,
      mobile: key.id === 'LightFighter',
      body_kinds: ['Planet'],
      requirements: [],
    })
    expect(result.flying).toBeNull()
  }
})

it('counts only owned protocol 4 fleets launched from the inspected body', () => {
  const origin = body.id
  const intent: components['schemas']['FleetIntent4'] = {
    origin,
    destination: {
      type: 'Body',
      id: 'target',
      expected_kind: 'Planet',
      expected_owner: 'owner',
    },
    mission: 'Transport',
    ships: [],
    cargo: { metal: '0', crystal: '0', deuterium: '0' },
    speed_percent: 100,
  }
  const fleet = {
    id: 'fleet',
    intent,
    origin: body.coordinates,
    destination: body.coordinates,
    leg: 'Returning' as const,
    ships: [{ ship_type: 'LightFighter' as const, count: '9007199254740993' }],
    cargo: body.amounts,
    due_at: 1000,
    launched_at: 0,
    duration_ms: 1000,
    paid_fuel: '0',
    can_recall: false,
  }
  const current: ProgressionProps['view'] = {
    ...view,
    protocol: 4,
    missions: {
      fleets: [
        fleet,
        { ...fleet, id: 'other', intent: { ...intent, origin: 'other' } },
      ],
      incoming: [],
      score_value_micro: '0',
      fleet_slots: '2',
    },
  }
  expect(
    unitCounts(current, body, {
      key: { kind: 'Ship', id: 'LightFighter' },
      enabled: true,
      mobile: true,
      body_kinds: ['Planet'],
      requirements: [],
    }).flying,
  ).toBe('9007199254740993')
})

it('hides only known empty inventory rows, preserving unknown legacy flight counts', () => {
  const catalog: components['schemas']['CatalogEntry3'][] = [
    ...(['SmallCargo', 'LightFighter', 'SolarSatellite'] as const).map(
      (id) => ({
        key: { kind: 'Ship' as const, id },
        enabled: true,
        mobile: id !== 'SolarSatellite',
        body_kinds: ['Planet' as const],
        requirements: [],
      }),
    ),
    {
      key: { kind: 'Defense', id: 'RocketLauncher' },
      enabled: true,
      mobile: false,
      body_kinds: ['Planet'],
      requirements: [],
    },
  ]
  expect(
    fleetInventoryRows({ ...view, catalog }, body).map(
      ({ entry }) => entry.key.id,
    ),
  ).toEqual(['LightFighter'])
  const current: components['schemas']['BoundView4'] = {
    ...view,
    protocol: 4,
    catalog,
    missions: {
      fleets: [],
      incoming: [],
      score_value_micro: '0',
      fleet_slots: '3',
    },
  }
  expect(fleetInventoryRows(current, body)).toEqual([])
  expect(
    fleetInventoryRows(current, {
      ...body,
      inventories: [
        {
          item: { kind: 'Ship', id: 'SolarSatellite' },
          count: '9007199254740993',
        },
      ],
    }).map(({ entry, counts }) => ({ id: entry.key.id, ...counts })),
  ).toEqual([
    {
      id: 'SolarSatellite',
      stationed: '9007199254740993',
      flying: null,
      ordered: '0',
    },
  ])
})
