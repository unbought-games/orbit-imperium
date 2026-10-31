import { describe, expect, it } from 'vitest'
import {
  ageCutoff,
  olderUnstarred,
  reportMetric,
  triageReports,
} from './report-triage'
import type { components } from '../contracts'
type Header = components['schemas']['ReportHeader4']
const row = (
  id: string,
  crystal?: string,
  overrides: Partial<Header> = {},
): Header => ({
  id,
  kind: 'Espionage',
  observed_at: 10,
  read: false,
  hidden: false,
  preview: {
    kind: 'Espionage',
    resources:
      crystal === undefined
        ? { visibility: 'Unknown' }
        : {
            visibility: 'Known',
            value: { metal: '5', crystal, deuterium: '7' },
          },
  },
  ...overrides,
})
describe('report triage', () => {
  it('sorts exact resources, with stable newest/id ties and unknowns last in both directions', () => {
    const rows = [
      row('unknown'),
      row('zero', '0'),
      row('a', '9007199254740993'),
      row('b', '9007199254740992'),
      row('c', '9007199254740993'),
    ]
    expect(
      triageReports(rows, 'crystal', false, 'all', false).map((r) => r.id),
    ).toEqual(['c', 'a', 'b', 'zero', 'unknown'])
    expect(
      triageReports(rows, 'crystal', true, 'all', false).map((r) => r.id),
    ).toEqual(['zero', 'b', 'c', 'a', 'unknown'])
    expect(reportMetric(rows[2], 'total')).toBe(9007199254741005n)
    expect(reportMetric(rows[2], 'metal')).toBe(5n)
    expect(reportMetric(rows[2], 'deuterium')).toBe(7n)
  })
  it('distinguishes known zero defenses from unknown and filters inapplicable metrics', () => {
    const rows = [
      row('unknown'),
      row('empty', '10', { defense_investment: '0' }),
      row('strong', '1', { defense_investment: '4000000000' }),
      row('combat', undefined, { kind: 'Combat' }),
    ]
    expect(
      triageReports(rows, 'defenses', true, 'espionage', false).map(
        (r) => r.id,
      ),
    ).toEqual(['empty', 'strong', 'unknown'])
    expect(
      triageReports(rows, 'defenses', true, 'all', true).map((r) => r.id),
    ).toEqual(['empty', 'strong'])
  })
  it('filters stars, unread and hidden independently', () => {
    const rows = [
      row('a', '1', { starred: true }),
      row('b', '1', { read: true }),
      row('c', '1', { hidden: true, starred: true }),
    ]
    expect(
      triageReports(rows, 'newest', false, 'starred', false).map((r) => r.id),
    ).toEqual(['a'])
    expect(
      triageReports(rows, 'newest', false, 'unread', false).map((r) => r.id),
    ).toEqual(['a'])
  })
  it('deletes strictly older than a valid fractional hour threshold, never stars or hidden reports', () => {
    const now = 10_000_000,
      cutoff = now - 1_800_000
    const rows = [
      row('old', '0', { observed_at: cutoff - 1 }),
      row('boundary', '0', { observed_at: cutoff }),
      row('new', '0', { observed_at: cutoff + 1 }),
      row('star', '0', { observed_at: 0, starred: true }),
      row('hidden', '0', { observed_at: 0, hidden: true }),
    ]
    expect(olderUnstarred(rows, '0.5', now).map((r) => r.id)).toEqual(['old'])
    for (const hours of ['', '0', '-1', 'Infinity', '1e100', 'abc'])
      expect(ageCutoff(hours, now)).toBeNull()
  })
})

it('browses old archives separately from the inbox without dropping starred reports', () => {
  const rows = [
    row('old', '1', { hidden: true, observed_at: 0 }),
    row('star', '2', { hidden: true, starred: true }),
    row('inbox', '3'),
  ]
  expect(
    triageReports(rows, 'oldest', false, 'all', false, 'archived').map(
      (r) => r.id,
    ),
  ).toEqual(['old', 'star'])
  expect(
    triageReports(rows, 'newest', false, 'starred', false, 'archived').map(
      (r) => r.id,
    ),
  ).toEqual(['star'])
  expect(
    triageReports(rows, 'newest', false, 'all', false).map((r) => r.id),
  ).toEqual(['inbox'])
})

it('combines report type and status within the active folder', () => {
  const rows = [
    row('spy-unread'),
    row('spy-read', undefined, { read: true }),
    row('return-unread', undefined, { kind: 'Returned' }),
    row('spy-archived', undefined, { hidden: true }),
    row('spy-starred', undefined, { read: true, starred: true }),
  ]
  expect(
    triageReports(
      rows,
      'newest',
      false,
      'unread',
      false,
      'inbox',
      'Espionage',
    ).map((report) => report.id),
  ).toEqual(['spy-unread'])
  expect(
    triageReports(
      rows,
      'newest',
      false,
      'starred',
      false,
      'inbox',
      'Espionage',
    ).map((report) => report.id),
  ).toEqual(['spy-starred'])
  expect(
    triageReports(
      rows,
      'newest',
      false,
      'all',
      false,
      'archived',
      'Espionage',
    ).map((report) => report.id),
  ).toEqual(['spy-archived'])
})
