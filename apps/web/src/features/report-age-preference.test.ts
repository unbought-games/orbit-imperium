import { expect, it } from 'vitest'
import { readReportAge } from './report-age-preference'
it('restores presets and custom edits, including invalid edits that must stay disabled', () => {
  for (const age of [
    { preset: '24', customHours: '12' },
    { preset: 'custom', customHours: '1.5' },
    { preset: 'custom', customHours: '' },
  ])
    expect(readReportAge({ getItem: () => JSON.stringify(age) })).toEqual(age)
})
it('defaults safely when storage is missing, corrupt, or blocked', () => {
  for (const value of [null, '{', '{}', '{"preset":"bad","customHours":"1"}'])
    expect(readReportAge({ getItem: () => value })).toEqual({
      preset: '168',
      customHours: '24',
    })
  expect(
    readReportAge({
      getItem: () => {
        throw Error('blocked')
      },
    }),
  ).toEqual({ preset: '168', customHours: '24' })
})
