import { expect, it, vi } from 'vitest'
import type { Attempt } from '../client-model/commands'
import { createGameStore } from '../client-model/game-store'
import { readyFixture } from '../test-support/bootstrap'
import {
  observeReportVisibilityCommit,
  pendingReportVisibility,
} from './report-visibility'

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

function commitFixture() {
  const store = createGameStore()
  const binding = readyFixture(4).snapshot.candidate.binding
  store.setState({ binding })
  const attempt = (
    commandId: string,
    status: Attempt['status'] = 'submitting',
    report = 'report',
    hidden = true,
  ): Attempt => ({
    envelope: {
      protocol: 4,
      binding,
      command_id: commandId,
      presence: null,
      command: {
        type: 'World',
        action: { type: 'SetReportHidden', report, hidden },
      },
    },
    status,
    receipt:
      status === 'committed'
        ? {
            protocol: 4,
            binding,
            command_id: commandId,
            status: 'Committed',
            admitted_at: 1,
            executed_at: 1,
            result_ids: [],
            minimum_viewer_revision: '2',
          }
        : status === 'rejected'
          ? {
              protocol: 4,
              binding,
              command_id: commandId,
              status: 'Rejected',
              admitted_at: 1,
              executed_at: 1,
              code: 'NotFound',
            }
          : null,
    reconciled: status === 'committed' || status === 'rejected',
  })
  const put = (a: Attempt) =>
    store.setState((s) => ({
      attempts: new Map(s.attempts).set(a.envelope.command_id, a),
    }))
  return { store, attempt, put }
}

it('notifies exactly once on the matching authoritative receipt, before pruning', () => {
  const { store, attempt, put } = commitFixture()
  put(attempt('old', 'committed'))
  const committed = vi.fn()
  observeReportVisibilityCommit(store, 'report', true, committed)
  put(attempt('other-report', 'committed', 'other'))
  put(attempt('restore', 'committed', 'report', false))
  put(attempt('archive'))
  put(attempt('archive', 'pending'))
  put(attempt('archive', 'uncertain'))
  expect(committed).not.toHaveBeenCalled()
  put(attempt('archive', 'committed'))
  expect(committed).toHaveBeenCalledTimes(1)
  store.setState({ attempts: new Map() })
  put(attempt('later', 'committed'))
  expect(committed).toHaveBeenCalledTimes(1)
})

it('does not accept a projected hidden flag as a committed gesture', () => {
  const { store, attempt, put } = commitFixture()
  const committed = vi.fn()
  observeReportVisibilityCommit(store, 'report', true, committed)
  put(attempt('archive', 'pending'))
  store.setState({
    reportHeaders: new Map([
      [
        'report',
        {
          revision: '2',
          header: {
            id: 'report',
            kind: 'Espionage',
            observed_at: 0,
            read: true,
            hidden: true,
          },
        },
      ],
    ]),
  })
  expect(committed).not.toHaveBeenCalled()
})

it('stops observing a rejected gesture', () => {
  const { store, attempt, put } = commitFixture()
  const committed = vi.fn()
  observeReportVisibilityCommit(store, 'report', true, committed)
  put(attempt('archive', 'rejected'))
  put(attempt('archive', 'committed'))
  expect(committed).not.toHaveBeenCalled()
})

it('stops on disposal or a changed session, even if the original binding returns', () => {
  for (const changeSession of [false, true]) {
    const { store, attempt, put } = commitFixture()
    const committed = vi.fn()
    const stop = observeReportVisibilityCommit(store, 'report', true, committed)
    put(attempt('archive'))
    if (changeSession) {
      const binding = store.getState().binding
      store.setState({ binding: null })
      store.setState({ binding })
    } else stop()
    put(attempt('archive', 'committed'))
    expect(committed).not.toHaveBeenCalled()
  }
})
