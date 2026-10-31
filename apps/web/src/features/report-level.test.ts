import { expect, it } from 'vitest'
import { reportLevel } from './report-level'

it('keeps observed zero, positive levels and unknown intelligence distinct', () => {
  for (const value of [0, '0'])
    expect(reportLevel(value)).toEqual({ value: '0', state: 'zero' })
  for (const value of [13, '13'])
    expect(reportLevel(value)).toEqual({ value: '13', state: 'known' })
  expect(reportLevel('9007199254740993')).toEqual({
    value: '9007199254740993',
    state: 'known',
  })
  for (const value of [undefined, null, 'Unknown', {}, -1, 1.5, NaN, Infinity])
    expect(reportLevel(value)).toEqual({ value: 'Unknown', state: 'unknown' })
})
