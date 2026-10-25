import type { components } from '../contracts'
type S = components['schemas']
export type Espionage = S['EspionagePayload4']
export type SimulationInputs = S['SimulationInputs']
export type SimulationResponse = S['SimulationResponse']
export type SimulationField = {
  key: string
  side: 'attacker' | 'defender'
  label: string
  value: string | null
  source: 'Report' | 'Your research' | 'Plan'
  item?: S['ItemKey3']
  technology?: number
}
export const combatTechnologies = [
  'WeaponsTechnology',
  'ShieldingTechnology',
  'ArmourTechnology',
] as const
export function simulationFields(
  report: Espionage,
  catalog: S['CatalogEntry3'][],
  research: { research: string; level: number }[],
): SimulationField[] {
  const units = catalog.filter(
    (e) => e.key.kind === 'Ship' || e.key.kind === 'Defense',
  )
  return (['attacker', 'defender'] as const).flatMap((side) => [
    ...combatTechnologies.map((id, technology) => ({
      key: `${side}:${id}`,
      side,
      label: id,
      technology,
      value:
        side === 'attacker'
          ? String(research.find((r) => r.research === id)?.level ?? 0)
          : report.research.visibility === 'Known' &&
              report.research.value[id] !== undefined
            ? String(report.research.value[id])
            : null,
      source:
        side === 'attacker' ? ('Your research' as const) : ('Report' as const),
    })),
    ...units
      .filter((e) => side === 'defender' || e.key.kind === 'Ship')
      .map((e) => {
        const observation =
          e.key.kind === 'Ship' ? report.fleet : report.defenses
        const item = e.key as S['ItemKey3']
        return {
          key: `${side}:${item.kind}:${item.id}`,
          side,
          label: item.id,
          item,
          value:
            side === 'attacker'
              ? '0'
              : observation.visibility === 'Known'
                ? (observation.value.find(
                    (u) => u.item.kind === item.kind && u.item.id === item.id,
                  )?.count ?? '0')
                : null,
          source: side === 'attacker' ? ('Plan' as const) : ('Report' as const),
        }
      }),
  ])
}
export function unsupportedReportUnits(
  report: Espionage,
  fields: SimulationField[],
) {
  return [report.fleet, report.defenses].flatMap((section) =>
    section.visibility === 'Known'
      ? section.value.filter(
          (u) =>
            u.item.kind !== 'Missile' &&
            BigInt(u.count) > 0n &&
            !fields.some(
              (f) => f.item?.kind === u.item.kind && f.item?.id === u.item.id,
            ),
        )
      : [],
  )
}
export function simulationInputs(
  fields: SimulationField[],
  edits: Record<string, string>,
): { inputs: SimulationInputs | null; error: string | null } {
  const inputs: SimulationInputs = {
    attacker: { technology: [0, 0, 0], units: [] },
    defender: { technology: [0, 0, 0], units: [] },
  }
  let total = 0
  for (const field of fields) {
    const value = edits[field.key] ?? field.value
    if (value === null || value === '')
      return {
        inputs: null,
        error:
          'Fill in unknown values or explicitly assume zero before simulating.',
      }
    if (!/^(0|[1-9][0-9]*)$/.test(value))
      return { inputs: null, error: 'Use nonnegative whole numbers.' }
    const n = Number(value)
    if (!Number.isSafeInteger(n) || n > (field.item ? 2000 : 100))
      return {
        inputs: null,
        error:
          'Simulation supports up to 2,000 units total and technology levels from 0 to 100. Report values are never truncated.',
      }
    if (field.item) {
      total += n
      if (n) inputs[field.side].units.push({ item: field.item, count: n })
    } else inputs[field.side].technology[field.technology!] = n
  }
  if (total > 2000)
    return {
      inputs: null,
      error: 'Keep both sides combined to 2,000 units or fewer.',
    }
  if (!inputs.attacker.units.length)
    return { inputs: null, error: 'Add at least one attacking ship.' }
  return { inputs, error: null }
}
export function simulationSummary(response: SimulationResponse) {
  const outcomes = [
    'AttackerVictory',
    'DefenderVictory',
    'Draw',
    'MutualDestruction',
  ] as const
  return outcomes.map((outcome) => ({
    outcome,
    count: response.samples.filter((s) => s.outcome === outcome).length,
  }))
}
export function averageSurvivors(
  response: SimulationResponse,
  side: 'attacker' | 'defender',
  item: S['ItemKey3'],
) {
  return (
    response.samples.reduce(
      (sum, sample) =>
        sum +
        (sample[side].find(
          (u) => u.item.kind === item.kind && u.item.id === item.id,
        )?.count ?? 0),
      0,
    ) / response.samples.length
  )
}

export function unknownAssumptions(
  fields: SimulationField[],
  edits: Record<string, string>,
) {
  return Object.fromEntries(
    fields
      .filter(
        (f) =>
          f.side === 'defender' &&
          f.value === null &&
          edits[f.key] === undefined,
      )
      .map((f) => [f.key, '0']),
  )
}
