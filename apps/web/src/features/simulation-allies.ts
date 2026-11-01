import type {
  SimulationField,
  SimulationInputs,
} from './combat-simulation-model'
import { simulationInputs } from './combat-simulation-model'
export type SimulationAlly = { id: string; side: 'attacker' | 'defender' }
export function allyFields(
  base: SimulationField[],
  ally: SimulationAlly,
): SimulationField[] {
  return base
    .filter((f) => f.side === 'attacker')
    .map((f) => ({
      ...f,
      side: ally.side,
      key: `${ally.id}:${f.key}`,
      available: undefined,
      value: f.item ? '0' : null,
      source: 'Plan',
    }))
}
export function withSimulationAllies(
  prepared: ReturnType<typeof simulationInputs>,
  base: SimulationField[],
  allies: SimulationAlly[],
  edits: Record<string, string>,
): ReturnType<typeof simulationInputs> {
  if (!prepared.inputs || !allies.length) return prepared
  const inputs: SimulationInputs = {
    ...prepared.inputs,
    attacking_allies: [],
    defending_allies: [],
  }
  for (const ally of allies) {
    const fields = allyFields(base, ally).map((f) => ({
      ...f,
      side: 'attacker' as const,
    }))
    const parsed = simulationInputs(fields, edits)
    if (!parsed.inputs)
      return { inputs: null, error: `Allied fleet: ${parsed.error}` }
    inputs[
      ally.side === 'attacker' ? 'attacking_allies' : 'defending_allies'
    ]!.push(parsed.inputs.attacker)
  }
  const forces = [
    inputs.attacker,
    inputs.defender,
    ...inputs.attacking_allies!,
    ...inputs.defending_allies!,
  ]
  if (
    forces.reduce((n, f) => n + f.units.reduce((n, u) => n + u.count, 0), 0) >
    2000
  )
    return {
      inputs: null,
      error: 'Keep all fleets combined to 2,000 units or fewer.',
    }
  return { inputs, error: null }
}
export function combinedSimulationUnits(
  inputs: SimulationInputs | null,
  side: 'attacker' | 'defender',
) {
  if (!inputs) return []
  const forces = [
    inputs[side],
    ...(inputs[side === 'attacker' ? 'attacking_allies' : 'defending_allies'] ??
      []),
  ]
  const units = new Map<string, SimulationInputs['attacker']['units'][number]>()
  for (const f of forces)
    for (const u of f.units) {
      const key = `${u.item.kind}:${u.item.id}`
      units.set(key, { ...u, count: (units.get(key)?.count ?? 0) + u.count })
    }
  return [...units.values()]
}
