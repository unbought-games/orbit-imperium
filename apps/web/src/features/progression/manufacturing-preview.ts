import type { BoundProgressionOptions } from '../../client-model/commands'
import { canonical } from '../../client-model/commands'
import { resourceShortfalls } from '../../client-model/resources'
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
  const queue = view.progression.manufacturing.filter(
    (batch) => batch.body === body.id,
  )
  const sameItem = (item: typeof unit.item) =>
    canonical(item) === canonical(unit.item)
  const inventory =
    body.inventories.find((entry) => sameItem(entry.item))?.count ?? '0'
  const count =
    queue
      .filter((batch) => sameItem(batch.item))
      .reduce(
        (total, batch) => total + BigInt(batch.remaining),
        BigInt(inventory),
      ) + n
  const start = Math.max(
    view.sampled_at,
    ...queue.map((batch) => batch.final_due_at),
  )
  const end = BigInt(start) + BigInt(unit.unit_duration_ms) * n
  const inRange =
    Object.values(paid).every((cost) => BigInt(cost) <= limit) &&
    count <= limit &&
    end <= BigInt(Number.MAX_SAFE_INTEGER)
  const blockers = source.blockers.filter(
    (entry) =>
      !['InsufficientResources', 'NumericRange', 'CapacityReserved'].includes(
        entry.code,
      ),
  )
  if (!inRange) blockers.push(block('NumericRange'))
  if (
    unit.item.kind === 'Defense' &&
    ['SmallShieldDome', 'LargeShieldDome'].includes(unit.item.id) &&
    count > 1n
  )
    blockers.push(block('CapacityReserved'))
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
