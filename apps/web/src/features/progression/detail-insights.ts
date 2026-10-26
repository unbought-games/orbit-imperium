import type { components } from '../../contracts'
import type { BoundProgressionOptions } from '../../client-model/commands'
import { rawResourceRates } from '../../client-model/production-rates'
import { currentResourceRates } from '../../ui/resource-rates'
import { formatRemaining } from '../../client-model/clock'
import { label } from '../../ui/format'
import type { ProgressionProps } from './shared'

type S = components['schemas']
type Resource = keyof S['Resources']
const million = 1000000n
const productionSetting = {
  MetalMine: 'metal_mine',
  CrystalMine: 'crystal_mine',
  DeuteriumSynthesizer: 'deuterium_synthesizer',
  SolarPlant: 'solar_plant',
} as const
const buildingResource: Record<string, Resource> = {
  MetalMine: 'metal',
  MetalStorage: 'metal',
  CrystalMine: 'crystal',
  CrystalStorage: 'crystal',
  DeuteriumSynthesizer: 'deuterium',
  DeuteriumTank: 'deuterium',
}
const clamp = (n: bigint, max: bigint) => (n < 0n ? 0n : n > max ? max : n)
function safeMilliseconds(n: bigint) {
  return n <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(n) : null
}
function durationFor(amount: bigint, rate: bigint) {
  return rate > 0n
    ? safeMilliseconds((amount * 3600000n + rate - 1n) / rate)
    : null
}

/** Estimates use the live balances and authoritative rates; nothing is cached as state. */
export function storageProjection(
  view: ProgressionProps['view'],
  body: S['BodyV3'],
  resource: Resource,
) {
  const amount = BigInt(body.amounts[resource]),
    capacity = BigInt(body.capacity[resource])
  const rate = currentResourceRates(view, body)?.[resource]
  const full = capacity > 0n && amount >= capacity
  return {
    resource,
    amount: amount.toString(),
    capacity: capacity.toString(),
    percent:
      capacity > 0n ? Number(clamp((amount * 100n) / capacity, 100n)) : 0,
    rate: rate ?? null,
    state: full
      ? 'full'
      : rate === undefined
        ? 'unknown'
        : BigInt(rate) <= 0n
          ? 'idle'
          : 'filling',
    milliseconds:
      full || rate === undefined || capacity <= amount
        ? null
        : durationFor(capacity - amount, BigInt(rate)),
  } as const
}

export function buildingInsights(
  view: ProgressionProps['view'],
  body: S['BodyV3'],
  id: string,
  proposal: BoundProgressionOptions | null,
) {
  const production = view.progression.production.find(
    (entry) => entry.body === body.id,
  )
  const setting = productionSetting[id as keyof typeof productionSetting]
  const percent = BigInt(
    setting && production ? production.settings[setting] : 100,
  )
  const supply = BigInt(production?.energy_supply ?? body.energy.supply)
  const demand = BigInt(production?.energy_demand ?? body.energy.demand)
  const utilization = BigInt(production?.utilization ?? body.energy.utilization)
  const benefit = proposal?.building_benefit
  const energy = proposal?.building_energy
  const consumptionChange = energy
    ? ((BigInt(energy.target_consumption) -
        BigInt(energy.current_consumption)) *
        percent) /
      100n
    : null
  const supplyChange =
    benefit?.kind === 'Energy'
      ? ((BigInt(benefit.target) - BigInt(benefit.current)) * percent) / 100n
      : 0n
  // Fusion benefits/fuel effects are not in this inspection contract; don't invent them.
  const afterDemand =
    consumptionChange !== null && id !== 'FusionReactor'
      ? demand + consumptionChange
      : null
  const afterSupply = supply + supplyChange
  const afterUtilization =
    afterDemand === null
      ? null
      : afterDemand <= 0n
        ? million
        : clamp((afterSupply * million) / afterDemand, million)
  const isOutput = benefit?.kind.endsWith('PerHour') ?? false
  const scaledOutput = (value: string, power: bigint) =>
    (BigInt(value) * percent * power) / (100n * million)
  const resource = buildingResource[id]
  const storage = resource ? storageProjection(view, body, resource) : null
  const rawRate = resource ? rawResourceRates(view, body)?.[resource] : null
  // Preserve base income (and net deuterium fuel use) from the server's rate.
  // Only replace this mine's contribution, using the projected planet-wide power.
  const planetOutput =
    isOutput &&
    production &&
    benefit &&
    resource &&
    rawRate != null &&
    afterUtilization !== null
      ? minePlanetOutput(
          body,
          resource,
          BigInt(rawRate),
          scaledOutput(benefit.current, utilization),
          scaledOutput(benefit.target, afterUtilization),
          scaledOutput(benefit.target, million),
        )
      : null
  return {
    storage,
    energy: {
      current: (supply - demand).toString(),
      after:
        afterDemand === null ? null : (afterSupply - afterDemand).toString(),
      change: consumptionChange?.toString() ?? null,
      balanceChange:
        afterDemand === null
          ? null
          : (supplyChange - (afterDemand - demand)).toString(),
      utilization: utilization.toString(),
      afterUtilization: afterUtilization?.toString() ?? null,
      constructionBlocked:
        proposal?.blockers.some(
          (blocker) => blocker.code === 'EnergyRequired',
        ) ?? false,
      show:
        (!!energy &&
          (BigInt(energy.current_consumption) !== 0n ||
            BigInt(energy.target_consumption) !== 0n)) ||
        benefit?.kind === 'Energy',
    },
    benefit: benefit
      ? {
          kind: benefit.kind,
          planetTotal: planetOutput !== null,
          fullPowerTarget: planetOutput?.fullPowerTarget ?? null,
          current:
            planetOutput?.current ??
            (benefit.kind === 'Energy' && production
              ? ((BigInt(benefit.current) * percent) / 100n).toString()
              : benefit.current),
          target:
            planetOutput?.target ??
            (benefit.kind === 'Energy' && production
              ? ((BigInt(benefit.target) * percent) / 100n).toString()
              : benefit.target),
          qualifier: isOutput
            ? planetOutput
              ? storage?.state === 'full'
                ? 'Storage is full; production resumes when storage has room'
                : resource === 'deuterium'
                  ? 'Planet total at saved settings, net of fuel use'
                  : 'Planet total at saved settings, including base production'
              : 'Mine potential at 100% output and full power; planet estimate unavailable'
            : benefit.kind === 'Energy'
              ? production
                ? null
                : 'At 100% output'
              : null,
        }
      : null,
  }
}

/** Compare rates at the same current stock levels, not speculative completion balances. */
function minePlanetOutput(
  body: S['BodyV3'],
  resource: Resource,
  currentRate: bigint,
  currentMine: bigint,
  targetMine: bigint,
  fullPowerMine: bigint,
) {
  const otherProduction = currentRate - currentMine
  const constrained = (rate: bigint) =>
    (rate > 0n &&
      BigInt(body.amounts[resource]) >= BigInt(body.capacity[resource])) ||
    (rate < 0n && BigInt(body.amounts[resource]) === 0n)
      ? '0'
      : rate.toString()
  return {
    current: constrained(currentRate),
    target: constrained(otherProduction + targetMine),
    fullPowerTarget: constrained(otherProduction + fullPowerMine),
  }
}

export type AffordabilityBlocker = {
  resource: Resource
  reason: 'capacity' | 'unknown' | 'no-production' | 'draining'
  capacity: string
}

/** Reasons are derived from the same live balances and costs as affordability. */
export function affordabilityForecast(
  view: ProgressionProps['view'],
  body: S['BodyV3'],
  cost: S['Resources'],
) {
  const rates = rawResourceRates(view, body)
  const blockers: AffordabilityBlocker[] = []
  let wait = 0
  for (const resource of ['metal', 'crystal', 'deuterium'] as const) {
    const missing = BigInt(cost[resource]) - BigInt(body.amounts[resource])
    // Delivered resources can legitimately exceed storage capacity.
    if (missing <= 0n) continue
    const capacity = body.capacity[resource]
    const rate = rates ? BigInt(rates[resource]) : null
    const ms = rate === null ? null : durationFor(missing, rate)
    const reason =
      BigInt(cost[resource]) > BigInt(capacity)
        ? 'capacity'
        : rate === null
          ? 'unknown'
          : rate < 0n
            ? 'draining'
            : rate === 0n
              ? 'no-production'
              : ms === null
                ? 'unknown'
                : null
    if (reason) blockers.push({ resource, reason, capacity })
    else wait = Math.max(wait, ms!)
  }
  return { wait: blockers.length ? null : wait, blockers }
}

export function affordabilityTime(
  view: ProgressionProps['view'],
  body: S['BodyV3'],
  cost: S['Resources'],
) {
  return affordabilityForecast(view, body, cost).wait
}

export function affordabilitySummary(
  forecast: ReturnType<typeof affordabilityForecast>,
) {
  if (forecast.blockers.some((blocker) => blocker.reason === 'capacity'))
    return 'Cost exceeds storage capacity'
  if (forecast.blockers.some((blocker) => blocker.reason === 'unknown'))
    return 'Timing unavailable'
  if (forecast.blockers.some((blocker) => blocker.reason === 'draining'))
    return 'Net production is negative'
  if (forecast.blockers.length) return 'No production'
  return null
}

export function blockerExplanation(
  blocker: S['ProgressionBlocker'],
  view: ProgressionProps['view'],
  body: S['BodyV3'],
  now: number,
) {
  const construction = view.constructions.find((work) => work.body === body.id)
  const research = view.progression.research_operation
  const until = (due: number) =>
    due <= now
      ? 'awaiting completion'
      : `finishes in ${formatRemaining(Math.ceil((due - now) / 1000))}`
  if (
    ['ActiveConstruction', 'YardLocked'].includes(blocker.code) &&
    construction
  )
    return `${label(construction.building)} level ${construction.target_level} · ${until(construction.due_at)}`
  if (blocker.code === 'ResearchActive' && research)
    return `${label(research.research)} level ${research.target_level} · ${until(research.due_at)}`
  if (blocker.code === 'LabLocked') {
    const lab = view.constructions.find(
      (work) => work.building === 'ResearchLab' && work.body === body.id,
    )
    if (lab) return `Research Lab construction · ${until(lab.due_at)}`
    if (
      research &&
      (research.host === body.id ||
        research.labs.some((lab) => lab.body === body.id))
    )
      return `${label(research.research)} · ${until(research.due_at)}`
  }
  if (blocker.code === 'NoFreeField')
    return 'Free a field by demolishing a building, or increase available fields.'
  if (blocker.code === 'QueueCapacity') {
    const queue = view.progression.manufacturing.filter(
      (batch) => batch.body === body.id,
    )
    return queue.length
      ? `Next batch · ${until(Math.min(...queue.map((batch) => batch.final_due_at)))}`
      : 'The production queue is full. Wait for an order to finish.'
  }
  return null
}

export function energySources(
  view: ProgressionProps['view'],
  body: S['BodyV3'],
) {
  return view.catalog.filter(
    (entry) =>
      ['SolarPlant', 'FusionReactor', 'SolarSatellite'].includes(
        entry.key.id,
      ) &&
      entry.enabled &&
      entry.body_kinds.includes(body.kind),
  )
}

export function nextLevelDependents(
  view: ProgressionProps['view'],
  key: S['CatalogKey3'],
  current: number,
  target: number,
) {
  return view.catalog
    .filter(
      (entry) =>
        entry.enabled &&
        entry.requirements.some(
          (r) =>
            (r.type === 'BodyBuilding'
              ? key.kind === 'Building' && r.building === key.id
              : key.kind === 'Research' && r.research === key.id) &&
            r.level > current &&
            r.level <= target,
        ),
    )
    .map((entry) => entry.key)
}
