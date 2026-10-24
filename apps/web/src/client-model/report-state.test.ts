import { expect, it } from 'vitest'
import type { Attempt, BoundReceipt } from './commands'
import {
  acceptReportVisibility,
  mergeReportHeaders,
  projectedReportHeader,
} from './report-state'

const header = {
  id: 'report',
  kind: 'Espionage',
  observed_at: 1000,
  read: false,
  hidden: false,
}
const headers = mergeReportHeaders(new Map(), [header], '1')
function attempt(
  status: Attempt['status'],
  hidden = true,
): Extract<Attempt, { envelope: { protocol: 4 } }> {
  return {
    envelope: {
      protocol: 4,
      binding: {
        account: 'account',
        player: 'player',
        universe: 'universe',
        epoch: 'epoch',
      },
      command_id: 'command',
      presence: null,
      command: {
        type: 'World',
        action: { type: 'SetReportHidden', report: 'report', hidden },
      },
    },
    status,
    receipt: null,
    reconciled: false,
  }
}
const receipt: BoundReceipt = {
  protocol: 4,
  binding: attempt('committed').envelope.binding,
  command_id: 'command',
  admitted_at: 1000,
  executed_at: 1000,
  status: 'Committed',
  result_ids: [],
  minimum_viewer_revision: '2',
}

it('projects deletion immediately and rolls back failures without mutating the source', () => {
  for (const status of ['submitting', 'pending'] as const)
    expect(
      projectedReportHeader(headers, [attempt(status)], 'report')?.hidden,
    ).toBe(true)
  for (const status of ['uncertain', 'rejected'] as const)
    expect(projectedReportHeader(headers, [attempt(status)], 'report')).toBe(
      header,
    )
  expect(headers.get('report')?.header).toBe(header)
})

it('reconciles a receipt without a game snapshot and resists stale list/detail responses', () => {
  const committed = acceptReportVisibility(
    headers,
    attempt('committed'),
    receipt,
  )
  expect(projectedReportHeader(committed, [], 'report')?.hidden).toBe(true)
  const stale = mergeReportHeaders(committed, [header], '1')
  expect(projectedReportHeader(stale, [], 'report')?.hidden).toBe(true)
  const restored = acceptReportVisibility(stale, attempt('committed', false), {
    ...receipt,
    minimum_viewer_revision: '3',
  })
  expect(projectedReportHeader(restored, [], 'report')?.hidden).toBe(false)
  const oldDeletion = acceptReportVisibility(
    restored,
    attempt('committed'),
    receipt,
  )
  expect(projectedReportHeader(oldDeletion, [], 'report')?.hidden).toBe(false)
})

it('projects a restored durable receipt until the report source catches up', () => {
  const committed = { ...attempt('committed'), receipt, reconciled: true }
  expect(projectedReportHeader(headers, [committed], 'report')?.hidden).toBe(
    true,
  )
  const fresh = mergeReportHeaders(headers, [header], '3')
  expect(projectedReportHeader(fresh, [committed], 'report')?.hidden).toBe(
    false,
  )
})

it('rolls back an optimistic restore to the last confirmed deletion', () => {
  const deleted = acceptReportVisibility(headers, attempt('committed'), receipt)
  expect(
    projectedReportHeader(deleted, [attempt('submitting', false)], 'report')
      ?.hidden,
  ).toBe(false)
  expect(
    projectedReportHeader(deleted, [attempt('rejected', false)], 'report')
      ?.hidden,
  ).toBe(true)
})
