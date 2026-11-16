import {
  averageSurvivors,
  type SimulationInputs,
  type SimulationResponse,
} from './combat-simulation-model'
import { combinedSimulationUnits } from './simulation-allies'

export type SimulationUnitOutcomes = Record<string, { remaining: number }>

/** Samples combine every fleet on a side; defense counts precede repairs. */
export function simulationUnitOutcomes(
  result: SimulationResponse | null,
  inputs: SimulationInputs | null,
  side: 'attacker' | 'defender',
): SimulationUnitOutcomes | null {
  if (!result?.samples.length || !inputs) return null
  return Object.fromEntries(
    combinedSimulationUnits(inputs, side).map((unit) => {
      const remaining = averageSurvivors(result, side, unit.item)
      return [`${unit.item.kind}:${unit.item.id}`, { remaining }]
    }),
  )
}
