import { compareShips } from './ship-order'
import type { components } from '../contracts'
import { resourceNames } from '../client-model/resources'
import { requiredRaidCapacity } from '../client-model/raid-loot'
type S = components['schemas']
export type Espionage = S['EspionagePayload4']
export type SimulationInputs = S['SimulationInputs']
export type SimulationResponse = S['SimulationResponse']
export type SimulationField = {
  key: string
  side: 'attacker' | 'defender'
  label: string
  value: string | null
  source: 'Report' | 'Your research' | 'Plan' | 'Imported plan'
  item?: S['ItemKey3']
  technology?: number
  available?: string
}
export const combatTechnologies = [
  'WeaponsTechnology',
  'ShieldingTechnology',
  'ArmourTechnology',
] as const
export function simulationFields(
  report: Espionage | undefined,
  catalog: S['CatalogEntry3'][],
  research: { research: string; level: number }[],
  inventories?: S['BodyV3']['inventories'],
): SimulationField[] {
  const units = catalog
    .filter(
      (e) =>
        (e.key.kind === 'Ship' || e.key.kind === 'Defense') &&
        !!(e.technical_data?.combat ?? e.ship_statistics?.combat),
    )
    .sort((a, b) =>
      a.key.kind === 'Ship' && b.key.kind === 'Ship'
        ? compareShips(a, b)
        : a.key.kind === b.key.kind
          ? 0
          : a.key.kind === 'Ship'
            ? -1
            : 1,
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
          : report?.research.visibility === 'Known' &&
              report.research.value[id] !== undefined
            ? String(report.research.value[id])
            : null,
      source:
        side === 'attacker'
          ? ('Your research' as const)
          : report
            ? ('Report' as const)
            : ('Plan' as const),
    })),
    ...units
      .filter((e) => side === 'defender' || (e.key.kind === 'Ship' && e.mobile))
      .map((e) => {
        const observation =
          e.key.kind === 'Ship' ? report?.fleet : report?.defenses
        const item = e.key as S['ItemKey3']
        return {
          key: `${side}:${item.kind}:${item.id}`,
          side,
          label: item.id,
          item,
          available:
            side === 'attacker' && inventories
              ? (inventories.find(
                  (u) => u.item.kind === item.kind && u.item.id === item.id,
                )?.count ?? '0')
              : undefined,
          value:
            side === 'attacker'
              ? '0'
              : observation?.visibility === 'Known'
                ? (observation.value.find(
                    (u) => u.item.kind === item.kind && u.item.id === item.id,
                  )?.count ?? '0')
                : null,
          source:
            side === 'attacker'
              ? ('Plan' as const)
              : report
                ? ('Report' as const)
                : ('Plan' as const),
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
  resources?: Espionage['resources'],
): { inputs: SimulationInputs | null; error: string | null } {
  const inputs: SimulationInputs = {
    ...(resources?.visibility === 'Known'
      ? { observed_resources: resources.value }
      : {}),
    attacker: { technology: [0, 0, 0], units: [] },
    defender: { technology: [0, 0, 0], units: [] },
  }
  let total = 0
  for (const field of fields) {
    const value = (edits[field.key] ?? field.value) || '0'
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
  const counts = {
    AttackerVictory: 0,
    DefenderVictory: 0,
    Draw: 0,
    MutualDestruction: 0,
  }
  for (const sample of response.samples) counts[sample.outcome]++
  return {
    victories: counts.AttackerVictory,
    defeats: counts.DefenderVictory,
    draws: counts.Draw + counts.MutualDestruction,
  }
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

export function blankSimulationEdits(
  fields: SimulationField[],
  edits: Record<string, string>,
) {
  return Object.fromEntries(
    fields.filter((f) => edits[f.key] === '').map((f) => [f.key, '0']),
  )
}

/** Aggregate the independently calculated battle samples, never an average fleet.
 * Keep micro-unit sums exact even above JavaScript's safe integer range. */
export function sampledAmounts(values: string[]) {
  if (!values.length) return null
  const amounts = values.map(BigInt)
  return {
    average: amounts.reduce((sum, n) => sum + n, 0n) / BigInt(amounts.length),
    minimum: amounts.reduce((a, b) => (a < b ? a : b)),
    maximum: amounts.reduce((a, b) => (a > b ? a : b)),
  }
}
function totalResources(resources: S['Resources']) {
  return resourceNames.reduce((sum, name) => sum + BigInt(resources[name]), 0n)
}

function winningCargoShortfall(response: SimulationResponse) {
  if (!response.loot_rules_enabled || !response.available_loot) return null
  const available = response.available_loot
  const required = requiredRaidCapacity(
    resourceNames.map((resource) => BigInt(available[resource]) / 1_000_000n),
  )
  // A loss or draw yields no haul for reasons other than cargo capacity.
  let maximum: bigint | null = null
  for (const sample of response.samples) {
    if (sample.outcome !== 'AttackerVictory') continue
    const free = BigInt(sample.surviving_cargo_capacity) / 1_000_000n
    const shortfall = free < required ? required - free : 0n
    if (maximum === null || shortfall > maximum) maximum = shortfall
  }
  return maximum
}

export function planningSummary(response: SimulationResponse) {
  const known =
    response.samples.length > 0 &&
    response.samples.every((s) => s.estimated_loot !== null)
  return {
    potentialLoot: response.available_loot
      ? totalResources(response.available_loot)
      : null,
    winningCargoShortfall: winningCargoShortfall(response),
    debris: response.samples.length
      ? resourceNames.map((resource) => ({
          resource,
          ...sampledAmounts(response.samples.map((s) => s.debris[resource]))!,
        }))
      : [],
    cargo: sampledAmounts(
      response.samples.map((s) => s.surviving_cargo_capacity),
    ),
    loot: known
      ? resourceNames.map((resource) => ({
          resource,
          ...sampledAmounts(
            response.samples.map((s) => s.estimated_loot![resource]),
          )!,
        }))
      : null,
    total: known
      ? sampledAmounts(
          response.samples.map((s) =>
            totalResources(s.estimated_loot!).toString(),
          ),
        )
      : null,
  }
}

export type MoonTarget =
  | 'Unknown'
  | 'PlanetWithoutMoon'
  | 'PlanetWithMoon'
  | 'Moon'

export function simulationGroupSummary(
  fields: SimulationField[],
  edits: Record<string, string>,
) {
  let total = 0n
  let unknown = 0
  let invalid = 0
  for (const field of fields) {
    const raw = edits[field.key] ?? field.value
    if (raw === null && field.source === 'Report') unknown++
    const value = raw || '0'
    if (!/^(0|[1-9][0-9]*)$/.test(value)) {
      invalid++
      continue
    }
    const count = BigInt(value)
    if (count > 2000n) invalid++
    else total += count
  }
  return { total, unknown, invalid }
}

export function battleEstimates(
  response: SimulationResponse,
  target: MoonTarget,
) {
  const samples = response.samples
  const averageRounds = samples.length
    ? samples.reduce((sum, s) => sum + s.rounds, 0) / samples.length
    : null
  const moonBlocked =
    response.moons_enabled === false ||
    target === 'Moon' ||
    target === 'PlanetWithMoon'
  const chances = samples.map((s) => s.moon_chance_percent)
  const moon = moonBlocked
    ? { average: 0, minimum: 0, maximum: 0 }
    : response.moons_enabled &&
        chances.length &&
        chances.every((n) => n !== undefined)
      ? {
          average: chances.reduce((sum, n) => sum + n, 0) / chances.length,
          minimum: Math.min(...chances),
          maximum: Math.max(...chances),
        }
      : null
  const capacity = response.recycler_capacity
    ? BigInt(response.recycler_capacity)
    : 0n
  // Harvest settles whole resources. Round each resource down before summing,
  // then round the ship count up. Estimate the average field, not average ships.
  const debris = samples.map((s) =>
    resourceNames.reduce(
      (sum, r) => sum + BigInt(s.debris[r]) / 1_000_000n,
      0n,
    ),
  )
  const wholeCapacity = capacity / 1_000_000n
  const recyclers =
    wholeCapacity > 0n && debris.length
      ? {
          estimate:
            (debris.reduce((sum, n) => sum + n, 0n) +
              BigInt(debris.length) * wholeCapacity -
              1n) /
            (BigInt(debris.length) * wholeCapacity),
          maximum:
            (debris.reduce((a, b) => (a > b ? a : b)) + wholeCapacity - 1n) /
            wholeCapacity,
        }
      : null
  return { averageRounds, moon, recyclers }
}
