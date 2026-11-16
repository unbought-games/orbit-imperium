import type { components } from '../contracts'
type S = components['schemas']
export const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
export const binding = {
  account: id(1),
  player: id(2),
  universe: id(3),
  epoch: id(4),
}
export const resources = {
  metal: '6661686240',
  crystal: '9420339537',
  deuterium: '3122000000',
}
export const body: components['schemas']['BodyV3'] = {
  id: id(5),
  coordinates: { galaxy: 1, system: 371, position: 12 },
  kind: 'Planet',
  amounts: resources,
  capacity: {
    metal: '10000000000',
    crystal: '10000000000',
    deuterium: '10000000000',
  },
  levels: {
    MetalMine: 1,
    CrystalMine: 1,
    DeuteriumSynthesizer: 0,
    SolarPlant: 1,
    MetalStorage: 0,
    CrystalStorage: 0,
    DeuteriumTank: 0,
    RoboticsFactory: 0,
    ResearchLab: 0,
    Shipyard: 0,
  },
  fields: 163,
  fields_used: 3,
  fields_reserved: 1,
  energy: { supply: '48400000', demand: '22000000', utilization: '1000000' },
  inventories: [{ item: { kind: 'Ship', id: 'SmallCargo' }, count: '2' }],
}
export function empireFixture(now = Date.now()) {
  const bodies: S['BodyV3'][] = [
    {
      ...body,
      coordinates: { galaxy: 1, system: 371, position: 4 },
      amounts: {
        metal: '25216000000',
        crystal: '14380000000',
        deuterium: '8720000000',
      },
      capacity: {
        metal: '40000000000',
        crystal: '30000000000',
        deuterium: '15000000000',
      },
      fields_used: 87,
      max_temperature: -20,
      min_temperature: -60,
      diameter_km: 12800,
      inventories: [
        ...body.inventories,
        { item: { kind: 'Ship', id: 'SolarSatellite' }, count: '4' },
        { item: { kind: 'Defense', id: 'RocketLauncher' }, count: '3' },
        { item: { kind: 'Defense', id: 'LightLaser' }, count: '2' },
      ],
    },
    {
      ...body,
      id: id(6),
      coordinates: { galaxy: 1, system: 380, position: 8 },
      amounts: {
        metal: '17304000000',
        crystal: '7510000000',
        deuterium: '4810000000',
      },
      fields_used: 34,
      fields: 230,
      colony: {
        diameter_km: 15191,
        min_temperature: 24,
        max_temperature: 64,
        created_at: now,
        profile: 'oi-redesign-reconstructed-v1',
      },
    },
    {
      ...body,
      id: id(7),
      coordinates: { galaxy: 1, system: 402, position: 2 },
      amounts: {
        metal: '8120000000',
        crystal: '4820000000',
        deuterium: '2170000000',
      },
      fields_used: 12,
      energy: { ...body.energy, demand: '68400000' },
    },
    {
      ...body,
      id: id(8),
      kind: 'Moon',
      coordinates: { galaxy: 1, system: 371, position: 4 },
      fields_used: 5,
      fields: 41,
    },
  ]
  const fleet = (
    n: number,
    origin: number,
    target: number,
    leg: 'Outbound' | 'Returning',
    mission: S['Mission4'],
  ): S['OwnMission4'] => ({
    id: id(30 + n),
    intent: {
      origin: bodies[origin].id,
      destination: {
        type: 'Body',
        id: bodies[target].id,
        expected_kind: bodies[target].kind,
        expected_owner: binding.player,
      },
      mission,
      ships: [{ owner: binding.player, ship_type: 'SmallCargo', count: '12' }],
      cargo: { metal: '0', crystal: '0', deuterium: '0' },
      speed_percent: 100,
    },
    origin: bodies[origin].coordinates,
    destination: bodies[target].coordinates,
    leg,
    ships: [{ ship_type: 'SmallCargo', count: '12' }],
    cargo: resources,
    due_at: now + 175000 + n * 180000,
    launched_at: now - 180000,
    duration_ms: 600000,
    paid_fuel: '1000000',
    can_recall: leg === 'Outbound',
  })
  return {
    protocol: 4 as const,
    bodies,
    constructions: bodies
      .filter((b) => b.kind === 'Planet')
      .map((b, i) => ({
        id: id(50 + i),
        body: b.id,
        building: (['MetalMine', 'RoboticsFactory', 'SolarPlant'] as const)[i],
        target_level: 8 - i,
        due_at: now + (i + 1) * 240000,
        paid: resources,
      })),
    researchOperation: {
      id: id(60),
      host: body.id,
      research: 'EnergyTechnology' as const,
      source_level: 4,
      target_level: 5,
      paid: resources,
      started_at: now - 360000,
      due_at: now + 160000,
      labs: [],
      effective_lab: '5',
      can_cancel: true,
    },
    manufacturing: bodies.slice(0, 2).map((b, i) => ({
      id: id(70 + i),
      body: b.id,
      item: {
        kind: 'Ship' as const,
        id: (['SmallCargo', 'LightFighter'] as const)[i],
      },
      quantity: '20',
      remaining: '12',
      completed_prefix: '8',
      paid: resources,
      accepted_at: now - 1800000,
      first_start_at: now - 1800000,
      next_due_at: now + 140000,
      final_due_at: now + 2340000,
      unit_duration_ms: 200000,
      state: 'Producing' as const,
      can_cancel: false as const,
    })),
    production: bodies.map((b): S['ProductionDto'] => ({
      body: b.id,
      solar_satellite: { unit_energy: '20000000', energy_supply: '80000000' },
      settings: {
        metal_mine: 100,
        crystal_mine: 100,
        deuterium_synthesizer: 100,
        solar_plant: 100,
        fusion_reactor: 100,
        solar_satellite: 100,
      },
      settings_revision: '1',
      editable: [],
      gross_per_hour: {
        metal: '720000000',
        crystal: '360000000',
        deuterium: '160000000',
      },
      fuel_deuterium_per_hour: '0',
      net_deuterium_per_hour: {
        sign: 'Nonnegative' as const,
        magnitude: '160000000',
      },
      energy_supply: b.energy.supply,
      energy_demand: b.energy.demand,
      utilization: '1000000',
      fuel_utilization: '1000000',
    })),
    missions: {
      fleets: [
        fleet(0, 0, 1, 'Outbound', 'Transport'),
        fleet(1, 1, 2, 'Returning', 'Transport'),
        fleet(2, 0, 2, 'Outbound', 'Deploy'),
      ],
      incoming: [
        {
          sender: id(99),
          origin: { galaxy: 1, system: 400, position: 9 },
          target: body.id,
          mission: 'Attack' as const,
          arrival_at: now + 95000,
          ships: { visibility: 'Unknown' as const },
        },
      ],
      score_value_micro: '0',
      fleet_slots: '8',
    },
  }
}
