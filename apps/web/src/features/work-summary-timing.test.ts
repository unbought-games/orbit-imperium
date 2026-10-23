import { expect, it } from 'vitest'
import { workSummaryTiming } from './work-summary-timing'

it.each([
  ['In progress', '35s', '35s'],
  ['Confirming', '1m 16s', '1m 16s · Confirming'],
  ['Cancelling', '35s', '35s · Cancelling'],
  ['In progress', 'Awaiting confirmation', 'Awaiting confirmation'],
  ['Awaiting confirmation', 'Awaiting confirmation', 'Awaiting confirmation'],
])(
  'formats %s and %s without redundant status',
  (status, countdown, expected) => {
    expect(workSummaryTiming(status, countdown)).toBe(expected)
  },
)
