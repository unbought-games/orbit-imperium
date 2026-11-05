import { expect, it } from 'vitest'
import { defaultReportOptions } from '../features/report-list-options'
import { reportQuery, reportQueryKey, unreadReportQuery } from './report-query'

it('requests only the selected folder, type, status and ordering', () => {
  expect(reportQuery(defaultReportOptions, false)).toEqual({
    kind: null,
    filter: {
      hidden: false,
      unread_only: false,
      starred_only: false,
      sort: 'newest',
    },
  })
  expect(
    reportQuery({ kind: 'Espionage', status: 'starred', sort: 'fleet' }, true),
  ).toEqual({
    kind: 'Espionage',
    filter: {
      hidden: true,
      unread_only: false,
      starred_only: true,
      sort: 'fleet',
    },
  })
  expect(
    reportQuery({ ...defaultReportOptions, status: 'unread' }, false),
  ).toEqual(unreadReportQuery)
})
it('uses distinct cursor owners for each filter and sort, independent of property order', () => {
  const base = reportQuery(defaultReportOptions, false)
  const key = reportQueryKey(base)
  for (const changed of [
    { ...base, kind: 'Combat' },
    { ...base, filter: { ...base.filter, hidden: true } },
    { ...base, filter: { ...base.filter, unread_only: true } },
    { ...base, filter: { ...base.filter, starred_only: true } },
    { ...base, filter: { ...base.filter, sort: 'oldest' as const } },
  ])
    expect(reportQueryKey(changed)).not.toBe(key)
  expect(
    reportQueryKey({ filter: { sort: 'newest', hidden: false }, kind: null }),
  ).toBe(key)
})
