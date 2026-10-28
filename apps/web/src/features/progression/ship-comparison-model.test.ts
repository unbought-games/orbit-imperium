import { describe, it, expect } from 'vitest'
import {
  comparisonStats,
  researchedValue,
  type ShipEntry,
  type Research,
} from './ship-comparison-model'
const ship: ShipEntry = {
  key: { kind: 'Ship', id: 'SmallCargo' },
  enabled: true,
  mobile: true,
  requirements: [],
  body_kinds: ['Planet'],
  ship_statistics: {
    cost: ['2000', '2000', '0'],
    propulsion: {
      cargo_capacity: '5000',
      base_speed: '5000',
      fuel_consumption: '10',
      drive: 'CombustionDrive',
      drive_coefficient: ['1', '10'],
      impulse_upgrade: {
        minimum_level: 5,
        base_speed: '10000',
        fuel_consumption: '20',
        drive_coefficient: ['1', '5'],
      },
    },
    combat: {
      attack_ticks: '500000',
      shield_ticks: '1000000',
      hull_ticks: '40000000',
      technology_bonus: ['1', '10'],
      rapid_fire_against: [],
      rapid_fire_from: [],
    },
  },
}
const research: Research = [
  { research: 'CombustionDrive', level: 6 },
  { research: 'ImpulseDrive', level: 4 },
  { research: 'WeaponsTechnology', level: 3 },
  { research: 'ShieldingTechnology', level: 2 },
  { research: 'ArmourTechnology', level: 1 },
]
describe('ship comparison', () => {
  it('uses completed levels and replaces the whole propulsion profile exactly at the threshold', () => {
    expect(comparisonStats(ship, research, 'current')).toMatchObject({
      speed: '8000',
      fuel: '10',
      drive: 'CombustionDrive',
      attack: '650000',
      shield: '1200000',
      hull: '44000000',
    })
    const changed = research.map((r) =>
      r.research === 'ImpulseDrive' ? { ...r, level: 5 } : r,
    )
    expect(comparisonStats(ship, changed, 'current')).toMatchObject({
      speed: '20000',
      fuel: '20',
      drive: 'ImpulseDrive',
    })
    expect(comparisonStats(ship, changed, 'base')).toMatchObject({
      speed: '5000',
      fuel: '10',
      drive: 'CombustionDrive',
      attack: '500000',
    })
  })
  it('allows heavy fighters to outrun light fighters with differing drive research', () => {
    const fighter = (
      base_speed: string,
      drive: 'CombustionDrive' | 'ImpulseDrive',
      drive_coefficient: string[],
    ): ShipEntry => ({
      ...ship,
      ship_statistics: {
        ...ship.ship_statistics!,
        propulsion: {
          ...ship.ship_statistics!.propulsion!,
          base_speed,
          drive,
          drive_coefficient,
          impulse_upgrade: null,
        },
      },
    })
    const levels: Research = [
      { research: 'CombustionDrive', level: 2 },
      { research: 'ImpulseDrive', level: 4 },
    ]
    expect(
      comparisonStats(
        fighter('12500', 'CombustionDrive', ['1', '10']),
        levels,
        'current',
      ).speed,
    ).toBe('15000')
    expect(
      comparisonStats(
        fighter('10000', 'ImpulseDrive', ['1', '5']),
        levels,
        'current',
      ).speed,
    ).toBe('18000')
  })
  it('honors custom replacement thresholds and coefficients without requiring the replaced drive', () => {
    const custom = structuredClone(ship)
    custom.ship_statistics!.propulsion!.impulse_upgrade = {
      minimum_level: 8,
      base_speed: '12000',
      fuel_consumption: '33',
      drive_coefficient: ['3', '10'],
    }
    expect(
      comparisonStats(
        custom,
        [{ research: 'ImpulseDrive', level: 7 }],
        'current',
      ).speed,
    ).toBeUndefined()
    expect(
      comparisonStats(
        custom,
        [{ research: 'ImpulseDrive', level: 8 }],
        'current',
      ),
    ).toMatchObject({ speed: '40800', fuel: '33', drive: 'ImpulseDrive' })
  })
  it('preserves unknown research, metadata, and disabled content', () => {
    expect(comparisonStats(ship, [], 'current')).toMatchObject({
      speed: undefined,
      drive: undefined,
      fuel: undefined,
      attack: undefined,
      cargo: '5000',
    })
    expect(
      comparisonStats({ ...ship, ship_statistics: undefined }, research, 'base')
        .speed,
    ).toBeUndefined()
    expect(
      comparisonStats({ ...ship, enabled: false }, research, 'base').cargo,
    ).toBeUndefined()
    const legacy = structuredClone(ship)
    delete legacy.ship_statistics!.propulsion!.drive_coefficient
    expect(comparisonStats(legacy, research, 'current').speed).toBeUndefined()
    expect(comparisonStats(legacy, research, 'base').speed).toBe('5000')
  })
  it('uses exact custom coefficients, floors speed, and rejects unsupported combat precision', () => {
    expect(researchedValue('4321', ['3', '20'], 2)).toBe('5617')
    expect(researchedValue('4321', ['3', '20'], 2, true)).toBeUndefined()
    expect(researchedValue('9007199254740993', ['1', '5'], 5)).toBe(
      '18014398509481986',
    )
    for (const coefficient of [undefined, ['1', '0'], ['bad', '2']])
      expect(researchedValue('1', coefficient, 0)).toBeUndefined()
  })
})

it('identifies satellites as stationary while retaining combat comparisons', () => {
  const satellite: ShipEntry = {
    ...ship,
    key: { kind: 'Ship', id: 'SolarSatellite' },
    mobile: false,
    ship_statistics: { ...ship.ship_statistics!, propulsion: null },
  }
  expect(comparisonStats(satellite, research, 'base')).toMatchObject({
    stationary: true,
    speed: undefined,
    drive: undefined,
    cargo: undefined,
  })
  expect(comparisonStats(satellite, research, 'current').attack).toBeDefined()
})

it('switches Bombers at Hyperspace Drive 8 and preserves unknown or retained profiles', () => {
  const bomber = structuredClone(ship)
  bomber.key.id = 'Bomber'
  const p = bomber.ship_statistics!.propulsion!
  Object.assign(p, {
    drive: 'ImpulseDrive',
    drive_coefficient: ['1', '5'],
    base_speed: '4000',
    fuel_consumption: '1000',
    impulse_upgrade: null,
    hyperspace_upgrade: {
      minimum_level: 8,
      base_speed: '5000',
      fuel_consumption: '1000',
      drive_coefficient: ['3', '10'],
    },
  })
  const levels = (drive: number, impulse = 6): Research => [
    { research: 'ImpulseDrive', level: impulse },
    { research: 'HyperspaceDrive', level: drive },
  ]
  expect(comparisonStats(bomber, levels(7), 'current')).toMatchObject({
    drive: 'ImpulseDrive',
    speed: '8800',
    fuel: '1000',
  })
  expect(comparisonStats(bomber, levels(8, 100), 'current')).toMatchObject({
    drive: 'HyperspaceDrive',
    speed: '17000',
    fuel: '1000',
  })
  expect(comparisonStats(bomber, levels(9), 'current').speed).toBe('18500')
  expect(comparisonStats(bomber, levels(8), 'base')).toMatchObject({
    drive: 'ImpulseDrive',
    speed: '4000',
  })
  expect(
    comparisonStats(bomber, [{ research: 'ImpulseDrive', level: 6 }], 'current')
      .speed,
  ).toBeUndefined()
  delete p.hyperspace_upgrade
  expect(comparisonStats(bomber, levels(8), 'current')).toMatchObject({
    drive: 'ImpulseDrive',
    speed: '8800',
  })
})
