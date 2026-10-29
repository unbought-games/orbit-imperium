import { expect, it } from 'vitest'
import type { Attempt } from '../client-model/commands'
import { pendingReportVisibility } from './report-visibility'

it('blocks both delete and restore while the same report has an unresolved preference', () => {
  for (const hidden of [true, false]) {
    const attempt = {
      envelope: {
        command: {
          type: 'World',
          action: { type: 'SetReportHidden', report: 'report', hidden },
        },
      },
      status: 'pending',
      reconciled: false,
    } as Attempt
    for (const status of ['submitting', 'pending', 'uncertain'] as const)
      expect(
        pendingReportVisibility([{ ...attempt, status }], 'report'),
      ).toBeDefined()
    expect(
      pendingReportVisibility([{ ...attempt, status: 'committed' }], 'report'),
    ).toBeUndefined()
    expect(pendingReportVisibility([attempt])).toBe(attempt)
    expect(pendingReportVisibility([attempt], 'other')).toBeUndefined()
    expect(
      pendingReportVisibility([{ ...attempt, status: 'rejected' }], 'report'),
    ).toBeUndefined()
    expect(
      pendingReportVisibility(
        [{ ...attempt, status: 'committed', reconciled: true }],
        'report',
      ),
    ).toBeUndefined()
  }
})

it('blocks every report in an unresolved batch, including durable uncertainty', () => {
  const attempt = {
    envelope: {
      command: {
        type: 'World',
        action: {
          type: 'SetReportsHidden',
          reports: ['first', 'second'],
          hidden: true,
        },
      },
    },
    status: 'pending',
    reconciled: false,
  } as Attempt
  for (const status of ['submitting', 'pending', 'uncertain'] as const) {
    const pending = { ...attempt, status }
    expect(pendingReportVisibility([pending])).toBe(pending)
    for (const report of ['first', 'second'])
      expect(pendingReportVisibility([pending], report)).toBe(pending)
    expect(pendingReportVisibility([pending], 'other')).toBeUndefined()
  }
  for (const status of ['committed', 'rejected'] as const)
    expect(
      pendingReportVisibility([{ ...attempt, status }], 'second'),
    ).toBeUndefined()
})
