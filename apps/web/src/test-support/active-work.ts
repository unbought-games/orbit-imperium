import type { components } from '../contracts'
import { body, id } from './empire'
type S = components['schemas']
const now = 1_800_000_000_000
const paid = { metal: '60000000', crystal: '15000000', deuterium: '0' }
const catalog: S['CatalogEntry3'][] = [
  { kind: 'Building', id: 'MetalMine' },
  { kind: 'Building', id: 'RoboticsFactory' },
  { kind: 'Research', id: 'EnergyTechnology' },
  { kind: 'Ship', id: 'SmallCargo' },
  { kind: 'Defense', id: 'RocketLauncher' },
].map((key) => ({
  key: key as S['CatalogKey3'],
  enabled: true,
  mobile: false,
  requirements: [],
  body_kinds: ['Planet'],
}))

export function activeWorkFixture(screen: string) {
  const building = screen === 'facilities' ? 'RoboticsFactory' : 'MetalMine'
  const planet = structuredClone(body)
  planet.levels[building] = 4
  const constructions: S['Construction3'][] = [
    {
      id: id(20),
      body: body.id,
      building,
      target_level: 5,
      paid,
      started_at: now - 60_000,
      due_at: now + 60_000,
    },
  ]
  const researchOperation: S['ResearchOperationDto'] = {
    id: id(21),
    host: body.id,
    research: 'EnergyTechnology',
    source_level: 4,
    target_level: 5,
    paid,
    started_at: now - 60_000,
    due_at: now + 60_000,
    labs: [],
    effective_lab: '1',
    can_cancel: true,
  }
  const manufacturing: S['ManufacturingBatchDto'][] = [
    {
      id: id(22),
      body: body.id,
      item:
        screen === 'defense'
          ? { kind: 'Defense', id: 'RocketLauncher' }
          : { kind: 'Ship', id: 'SmallCargo' },
      quantity: '4',
      completed_prefix: '0',
      remaining: '4',
      paid,
      accepted_at: now - 60_000,
      first_start_at: now - 60_000,
      next_due_at: now + 60_000,
      final_due_at: now + 420_000,
      unit_duration_ms: 120_000,
      state: 'Producing',
      can_cancel: false,
    },
  ]
  return {
    bodies: [planet],
    catalog,
    constructions,
    researchOperation,
    manufacturing,
    sampledAt: now,
    research: [{ research: 'EnergyTechnology' as const, level: 4 }],
  }
}
