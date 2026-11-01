import { expect, it } from 'vitest'
import type { manufacturingQueue } from '../client-model/manufacturing-queue'
import { manufacturingSummary } from './manufacturing-summary-model'

type Batch = ReturnType<typeof manufacturingQueue>[number]
const active: Batch = {
  id: 'active',
  item: { kind: 'Ship', id: 'LightFighter' },
  remaining: '2',
  status: 'Producing',
  due: 1500,
  finalDue: 2500,
  unitDuration: 1000,
}
const queued: Batch = {
  ...active,
  id: 'queued',
  status: 'Queued',
  due: 2500,
  finalDue: 4500,
}
const pending: Batch = {
  ...active,
  id: 'pending',
  status: 'Confirming',
  due: undefined,
  finalDue: undefined,
  unitDuration: undefined,
}

it('focuses the producing order and preserves the order of all upcoming batches', () => {
  const queue = [queued, active, pending]
  const result = manufacturingSummary(queue, 1000)
  expect(result.current).toBe(active)
  expect(result.upcoming).toEqual([queued, pending])
  expect(result.percent).toBe(50)
  expect(queue).toEqual([queued, active, pending])
})

it('keeps the current order visible at its deadline until the server confirms completion', () => {
  expect(manufacturingSummary([active, queued], 1500)).toMatchObject({
    current: active,
    percent: 100,
  })
  expect(manufacturingSummary([active, queued], 9000)).toMatchObject({
    current: active,
    percent: 100,
  })
  expect(manufacturingSummary([active], 0).percent).toBe(0)
  expect(manufacturingSummary([queued], 1500)).toEqual({
    current: queued,
    upcoming: [],
    percent: null,
  })
})

it('handles pending-only and empty queues without inventing production progress', () => {
  expect(manufacturingSummary([pending], 2000)).toEqual({
    current: pending,
    upcoming: [],
    percent: null,
  })
  expect(manufacturingSummary([], 2000)).toEqual({
    current: undefined,
    upcoming: [],
    percent: null,
  })
})
