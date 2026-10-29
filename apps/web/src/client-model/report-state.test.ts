import { expect, it } from 'vitest'
import type { Attempt, BoundReceipt } from './commands'
import {
  acceptReportVisibility,
  mergeReportHeaders,
  projectedReportHeader,
  supersededReportFailures,
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

it('projects stars optimistically, rolls back rejected stars and persists confirmed protection across stale responses', () => {
  const star = attempt('submitting')
  star.envelope.command = {
    type: 'World',
    action: { type: 'SetReportStarred', report: 'report', starred: true },
  }
  expect(projectedReportHeader(headers, [star], 'report')?.starred).toBe(true)
  expect(
    projectedReportHeader(headers, [{ ...star, status: 'rejected' }], 'report')
      ?.starred,
  ).toBeUndefined()
  const committed = acceptReportVisibility(headers, star, receipt)
  expect(
    projectedReportHeader(
      mergeReportHeaders(committed, [header], '1'),
      [],
      'report',
    )?.starred,
  ).toBe(true)
  expect(committed.get('report')?.header.hidden).toBe(false)
})

it('a confirmed star clears only earlier star failures, leaving deletion failures visible', () => {
  const star = attempt('rejected')
  star.envelope.command = {
    type: 'World',
    action: { type: 'SetReportStarred', report: 'report', starred: true },
  }
  const ledger = new Map([
    ['hide-failure', attempt('rejected')],
    ['star-failure', star],
    [
      'star-success',
      { ...star, status: 'committed' as const, reconciled: true },
    ],
  ])
  expect(supersededReportFailures(ledger).map(([id]) => id)).toEqual([
    'star-failure',
  ])
})

// Sharing is committed outside the command stream but advances the same viewer
// revision used by report reads, including bulk cleanup's authoritative headers.
it('keeps publication protection when an older report response arrives later', () => {
  const shared = { ...header, starred: true, shared: true }
  const published = mergeReportHeaders(headers, [shared], '3')
  const lateRead = mergeReportHeaders(
    published,
    [{ ...header, starred: false, shared: false }],
    '2',
  )
  expect(projectedReportHeader(lateRead, [], header.id)).toEqual(shared)
  const revoked = mergeReportHeaders(
    lateRead,
    [{ ...shared, shared: false }],
    '4',
  )
  expect(projectedReportHeader(revoked, [], header.id)).toEqual({
    ...shared,
    shared: false,
  })
})

it('acknowledges a report read only after commitment and rejects older unread observations', () => {
  const read = attempt('committed')
  read.envelope.command = {
    type: 'World',
    action: { type: 'MarkReportRead', report: 'report' },
  }
  const accepted = acceptReportVisibility(headers, read, receipt)
  expect(accepted.get('report')?.header.read).toBe(true)
  expect(
    mergeReportHeaders(accepted, [header], '1').get('report')?.header.read,
  ).toBe(true)
  expect(headers.get('report')?.header.read).toBe(false)
})

function bulkAttempt(status: Attempt['status'], hidden = true) {
  const batch = attempt(status)
  batch.envelope.command = {
    type: 'World',
    action: { type: 'SetReportsHidden', reports: ['report', 'second'], hidden },
  }
  return batch
}
const batchHeaders = mergeReportHeaders(
  headers,
  [
    { ...header, id: 'second' },
    { ...header, id: 'unselected' },
  ],
  '1',
)
it('projects every batch member immediately, rolls back the whole batch on failure and leaves other reports alone', () => {
  for (const status of [
    'submitting',
    'pending',
    'rejected',
    'uncertain',
  ] as const) {
    for (const id of ['report', 'second'])
      expect(
        projectedReportHeader(batchHeaders, [bulkAttempt(status)], id)?.hidden,
      ).toBe(status === 'submitting' || status === 'pending')
    expect(
      projectedReportHeader(batchHeaders, [bulkAttempt(status)], 'unselected')
        ?.hidden,
    ).toBe(false)
  }
})
it('reconciles the entire batch at one revision and prevents stale reads undoing it', () => {
  const accepted = acceptReportVisibility(
    batchHeaders,
    bulkAttempt('committed'),
    receipt,
  )
  const stale = mergeReportHeaders(
    accepted,
    [...batchHeaders.values()].map((v) => v.header),
    '1',
  )
  for (const id of ['report', 'second']) {
    expect(stale.get(id)?.header.hidden).toBe(true)
    expect(
      projectedReportHeader(
        batchHeaders,
        [{ ...bulkAttempt('committed'), receipt }],
        id,
      )?.hidden,
    ).toBe(true)
  }
  const restored = acceptReportVisibility(
    stale,
    bulkAttempt('committed', false),
    { ...receipt, minimum_viewer_revision: '3' },
  )
  for (const id of ['report', 'second'])
    expect(restored.get(id)?.header.hidden).toBe(false)
  expect(stale.get('unselected')?.header.hidden).toBe(false)
})
it('keeps a batch failure until all affected reports have later confirmed visibility actions', () => {
  const failed = bulkAttempt('rejected')
  const single = { ...attempt('committed'), reconciled: true }
  const ledger = new Map([
    ['batch', failed],
    ['single', single],
  ])
  expect(supersededReportFailures(ledger)).toEqual([])
  ledger.set('retry', { ...bulkAttempt('committed'), reconciled: true })
  expect(supersededReportFailures(ledger).map(([id]) => id)).toEqual(['batch'])
})
