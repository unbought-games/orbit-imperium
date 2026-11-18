import type { BoundProgressionOptions } from '../../client-model/commands'
import { canonical } from '../../client-model/commands'
import { resourceNames, resourceShortfalls } from '../../client-model/resources'
import type { ProgressionProps } from './shared'
import { technologyRequest } from './options'

type Blocker = BoundProgressionOptions['blockers'][number]
const limit = 9223372036854775807n
const block = (code: Blocker['code']): Blocker => ({
  code,
  requirement: null,
  required: null,
  actual: null,
  resource: null,
  unit: null,
})

type UnitTerms = Extract<
  BoundProgressionOptions['terms'],
  { type: 'Manufacture' }
>
const min = (a: bigint, b: bigint) => (a < b ? a : b)

function batchLimits(
  unit: UnitTerms,
  body: ProgressionProps['body'],
  view: ProgressionProps['view'],
) {
  const queue = view.progression.manufacturing.filter(
    (batch) => batch.body === body.id,
  )
  const sameItem = (item: typeof unit.item) =>
    canonical(item) === canonical(unit.item)
  const inventory =
    body.inventories.find((entry) => sameItem(entry.item))?.count ?? '0'
  const existing = queue
    .filter((batch) => sameItem(batch.item))
    .reduce(
      (total, batch) => total + BigInt(batch.remaining),
      BigInt(inventory),
    )
  const start = Math.max(
    view.sampled_at,
    ...queue.map((batch) => batch.final_due_at),
  )
  const duration = BigInt(unit.unit_duration_ms)
  const timeLimit =
    duration > 0n
      ? (BigInt(Number.MAX_SAFE_INTEGER) - BigInt(start)) / duration
      : 0n
  const domeLimit =
    unit.item.kind === 'Defense' &&
    ['SmallShieldDome', 'LargeShieldDome'].includes(unit.item.id)
      ? 1n - existing
      : null
  return { start, numericLimit: min(limit - existing, timeLimit), domeLimit }
}

/** The inspector requests terms for one unit. A structural blocker on that
 * order applies to every positive quantity until the next inspection. */
export function maximumManufacturingQuantity(
  source: BoundProgressionOptions | null,
  body: ProgressionProps['body'],
  view: ProgressionProps['view'],
) {
  const unit = source?.terms
  if (
    !source ||
    unit?.type !== 'Manufacture' ||
    unit.body !== body.id ||
    (unit.item.kind !== 'Ship' && unit.item.kind !== 'Defense') ||
    source.blockers.some((b) => b.code !== 'InsufficientResources')
  )
    return 0n
  const { numericLimit, domeLimit } = batchLimits(unit, body, view)
  let maximum = min(numericLimit, domeLimit ?? limit)
  for (const name of resourceNames) {
    const cost = BigInt(unit.unit_cost[name])
    if (cost > 0n)
      maximum = min(maximum, min(BigInt(body.amounts[name]), limit) / cost)
  }
  return maximum > 0n ? maximum : 0n
}

/** Local presentation only: never carries a server terms hash or authorizes a command. */
export function manufacturingPreview(
  source: BoundProgressionOptions | null,
  view: ProgressionProps['view'],
  quantity: string,
) {
  const unit = source?.terms
  if (!source || unit?.type !== 'Manufacture') return null
  const request = technologyRequest(unit.item, unit.body, 'Upgrade', quantity)
  const body = view.bodies.find((body) => body.id === unit.body)
  if (!body || request?.type !== 'Manufacture') return null
  const n = BigInt(quantity)
  const paid = {
    metal: (BigInt(unit.unit_cost.metal) * n).toString(),
    crystal: (BigInt(unit.unit_cost.crystal) * n).toString(),
    deuterium: (BigInt(unit.unit_cost.deuterium) * n).toString(),
  }
  const { start, numericLimit, domeLimit } = batchLimits(unit, body, view)
  const end = BigInt(start) + BigInt(unit.unit_duration_ms) * n
  const inRange =
    Object.values(paid).every((cost) => BigInt(cost) <= limit) &&
    n <= numericLimit
  const blockers = source.blockers.filter(
    (entry) =>
      !['InsufficientResources', 'NumericRange', 'CapacityReserved'].includes(
        entry.code,
      ),
  )
  if (!inRange) blockers.push(block('NumericRange'))
  if (domeLimit !== null && n > domeLimit)
    blockers.push(block('CapacityReserved'))
  if (unit.item.kind === 'Missile') {
    if (!body.silo || !unit.silo_slots)
      blockers.push(block('UnavailableContent'))
    else if (
      BigInt(body.silo.occupied) +
        BigInt(body.silo.reserved) +
        n * BigInt(unit.silo_slots) >
      BigInt(body.silo.total)
    )
      blockers.push(block('CapacityReserved'))
  }
  const names = {
    metal: 'Metal',
    crystal: 'Crystal',
    deuterium: 'Deuterium',
  } as const
  blockers.push(
    ...resourceShortfalls(paid, body.amounts).map(
      ({ name, required, actual }) => ({
        ...block('InsufficientResources'),
        required,
        actual,
        resource: names[name],
        unit: 'MicroResource' as const,
      }),
    ),
  )
  return {
    request,
    terms: { ...unit, quantity, paid },
    blockers,
    estimates: inRange
      ? { first_start_at: start, final_due_at: Number(end) }
      : null,
  }
}

export function matchesManufacturingPreview(
  preview: NonNullable<ReturnType<typeof manufacturingPreview>>,
  validated: BoundProgressionOptions,
) {
  return (
    canonical(preview.request) === canonical(validated.request) &&
    canonical(preview.terms) === canonical(validated.terms)
  )
}
