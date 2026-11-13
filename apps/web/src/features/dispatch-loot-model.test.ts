import { expect, it } from 'vitest'
import {
  failedDispatchLootRead,
  matchingResourceObservation,
  observedLootPlan,
} from './dispatch-loot-model'
import type { components } from '../contracts'
it.each([
  [['0', '0', '0'], 0n, 0n],
  [['12000000', '0', '0'], 6n, 9n],
  [['12000000', '12000000', '12000000'], 18n, 18n],
  [['3999999', '1999999', '0'], 1n, 2n],
] as const)(
  'estimates whole loot and cargo for %j',
  (values, total, required) => {
    expect(
      observedLootPlan({
        metal: values[0],
        crystal: values[1],
        deuterium: values[2],
      }),
    ).toMatchObject({ total, required })
  },
)
const target = { id: 'body', owner: 'owner', kind: 'Planet' as const }
const report: components['schemas']['ReportHeader4'] = {
  id: 'report',
  kind: 'Espionage',
  observed_at: 10,
  read: false,
  hidden: false,
  preview: {
    kind: 'Espionage',
    target: {
      body: target.id,
      owner: target.owner,
      kind: target.kind,
      coordinates: { galaxy: 1, system: 1, position: 1 },
    },
    resources: {
      visibility: 'Known',
      value: { metal: '0', crystal: '0', deuterium: '0' },
    },
  },
}
it('keeps known zero distinct from unknown and rejects changed target identity', () => {
  expect(matchingResourceObservation(report, target)?.resources.metal).toBe('0')
  expect(matchingResourceObservation(null, target)).toBeNull()
  for (const change of [
    { id: 'other' },
    { owner: 'other' },
    { kind: 'Moon' as const },
  ])
    expect(
      matchingResourceObservation(report, { ...target, ...change }),
    ).toBeNull()
  expect(
    matchingResourceObservation(
      {
        ...report,
        preview: {
          kind: 'Espionage',
          target:
            report.preview?.kind === 'Espionage'
              ? report.preview.target
              : undefined,
          resources: { visibility: 'Unknown' },
        },
      },
      target,
    ),
  ).toBeNull()
})

it('keeps large report amounts exact', () => {
  expect(
    observedLootPlan({
      metal: '9007199254740993000000',
      crystal: '0',
      deuterium: '0',
    }).total,
  ).toBe(4503599627370496n)
})

it('retains historical evidence after a refresh error only for the same source', () => {
  const source = { model: {}, binding: 'account-one', id: 'body' }
  const previous = { ...source, report }
  expect(failedDispatchLootRead(previous, source)).toEqual({
    ...source,
    report,
    error: true,
  })
  for (const changed of [
    { model: {} },
    { binding: 'account-two' },
    { id: 'other' },
  ])
    expect(
      failedDispatchLootRead(previous, { ...source, ...changed }).report,
    ).toBeUndefined()
  expect(failedDispatchLootRead(null, source)).toEqual({
    ...source,
    report: undefined,
    error: true,
  })
})

it.each([
  [0n, 0n],
  [6n, 4n],
  [8n, 5n],
  [9n, 6n],
  [100n, 6n],
  [-5n, 0n],
])('reports loot that fits %s free cargo space', (capacity, carried) => {
  expect(
    observedLootPlan(
      { metal: '12000000', crystal: '0', deuterium: '0' },
      capacity,
    ).carried,
  ).toBe(carried)
})
it('keeps capacity unknown until the estimate and cargo edits are valid', () => {
  expect(
    observedLootPlan({ metal: '12000000', crystal: '0', deuterium: '0' }, null)
      .carried,
  ).toBeNull()
})
