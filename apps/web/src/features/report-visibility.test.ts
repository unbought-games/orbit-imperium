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
    for (const status of [
      'submitting',
      'pending',
      'uncertain',
      'committed',
    ] as const)
      expect(
        pendingReportVisibility([{ ...attempt, status }], 'report'),
      ).toBeDefined()
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
