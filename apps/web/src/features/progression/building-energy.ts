import type { components } from '../../contracts'

type S = components['schemas']

export const mineProductionSettings: Partial<
  Record<string, keyof S['ProductionSettings']>
> = {
  MetalMine: 'metal_mine',
  CrystalMine: 'crystal_mine',
  DeuteriumSynthesizer: 'deuterium_synthesizer',
}

/** The quote provides consumption at full output, in micro-energy units. */
export function buildingDemandChange(
  energy: S['BuildingEnergy'],
  percent: bigint,
) {
  return (
    ((BigInt(energy.target_consumption) - BigInt(energy.current_consumption)) *
      percent) /
    100n
  )
}
