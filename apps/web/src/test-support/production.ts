import type { components } from '../contracts'

type S = components['schemas']
/** A complete, controlled economy snapshot for UI tests, not an economy calculator. */
export function productionFixture(
  body: Pick<S['BodyV3'], 'id' | 'kind' | 'energy'>,
): S['ProductionDto'] {
  return {
    body: body.id,
    settings: {
      metal_mine: 100,
      crystal_mine: 100,
      deuterium_synthesizer: 100,
      solar_plant: 100,
      fusion_reactor: 100,
      solar_satellite: 100,
    },
    settings_revision: '1',
    editable: [
      'metal_mine',
      'crystal_mine',
      'deuterium_synthesizer',
      'solar_plant',
    ],
    gross_per_hour: {
      metal: body.kind === 'Planet' ? '63000000' : '0',
      crystal: body.kind === 'Planet' ? '37000000' : '0',
      deuterium: '0',
    },
    fuel_deuterium_per_hour: '0',
    net_deuterium_per_hour: { sign: 'Nonnegative', magnitude: '0' },
    energy_supply: body.energy.supply,
    energy_demand: body.energy.demand,
    utilization: body.energy.utilization,
    fuel_utilization: '1000000',
  }
}
