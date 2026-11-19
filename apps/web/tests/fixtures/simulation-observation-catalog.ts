import type { components } from '../../src/contracts'
const technicalData = {
  facts: [],
  bonuses: [],
  storage_capacities: null,
  combat: {
    attack_ticks: '5000000',
    shield_ticks: '1000000',
    hull_ticks: '40000000',
    rapid_fire_against: [],
    rapid_fire_from: [],
  },
}
export const catalog: components['schemas']['CatalogEntry3'][] = [
  {
    key: { kind: 'Ship', id: 'Bomber' },
    body_kinds: ['Planet'],
    requirements: [],
    enabled: true,
    mobile: true,
    ship_statistics: {
      propulsion: null,
      combat: {
        ...technicalData.combat,
        attack_ticks: '100000000',
        shield_ticks: '50000000',
        hull_ticks: '750000000',
      },
    },
  },
  {
    key: { kind: 'Ship', id: 'LightFighter' },
    body_kinds: ['Planet'],
    requirements: [],
    enabled: true,
    mobile: true,
    technical_data: technicalData,
  },
  {
    key: { kind: 'Defense', id: 'RocketLauncher' },
    body_kinds: ['Planet'],
    requirements: [],
    enabled: true,
    mobile: false,
    technical_data: technicalData,
  },
  {
    key: { kind: 'Defense', id: 'HeavyLaser' },
    body_kinds: ['Planet'],
    requirements: [],
    enabled: true,
    mobile: false,
    technical_data: {
      ...technicalData,
      combat: {
        ...technicalData.combat,
        attack_ticks: '25000000',
        shield_ticks: '10000000',
        hull_ticks: '80000000',
      },
    },
  },
  {
    key: { kind: 'Defense', id: 'LargeShieldDome' },
    body_kinds: ['Planet'],
    requirements: [],
    enabled: true,
    mobile: false,
    technical_data: {
      ...technicalData,
      combat: {
        ...technicalData.combat,
        attack_ticks: '100000',
        shield_ticks: '1000000000',
        hull_ticks: '1000000000',
      },
    },
  },
  {
    key: { kind: 'Defense', id: 'PlasmaTurret' },
    body_kinds: ['Planet'],
    requirements: [],
    enabled: true,
    mobile: false,
    technical_data: {
      ...technicalData,
      combat: {
        ...technicalData.combat,
        attack_ticks: '300000000',
        shield_ticks: '30000000',
        hull_ticks: '1000000000',
      },
    },
  },
]
