import { expect, it } from 'vitest'
import { actionLabel, changedAnnouncements } from './action-announcements'
import type { Attempt } from '../client-model/commands'
const a = {
  envelope: { command_id: 'a', command: { type: 'StartUpgrade' } },
  status: 'committed',
  reconciled: false,
} as Extract<Attempt, { envelope: { protocol: 3 } }>
it('announces only meaningful changed outcomes, not polling or unchanged older actions', () => {
  const first = changedAnnouncements(new Map(), [a])
  expect(first.message).toContain('awaiting updated view')
  expect(
    changedAnnouncements(first.current, [structuredClone(a)]).message,
  ).toBe('')
  const second = changedAnnouncements(first.current, [
    a,
    { ...a, envelope: { ...a.envelope, command_id: 'b' }, status: 'uncertain' },
  ])
  expect(second.message).toBe(
    'Start Upgrade: Response uncertain. Your action is saved.',
  )
  expect(changedAnnouncements(second.current, [a]).message).toBe('')
  expect(
    changedAnnouncements(second.current, [{ ...a, reconciled: true }]).message,
  ).toBe('Start Upgrade: Action confirmed.')
})
it('identifies nested world actions in live announcements', () => {
  const world: Attempt = {
    envelope: {
      protocol: 4,
      binding: {
        account: 'account',
        player: 'player',
        universe: 'universe',
        epoch: 'epoch',
      },
      command_id: 'recall',
      presence: null,
      command: {
        type: 'World',
        action: { type: 'RecallMission', fleet: 'fleet' },
      },
    },
    status: 'uncertain',
    receipt: null,
    reconciled: false,
  }
  expect(changedAnnouncements(new Map(), [world]).message).toBe(
    'Recall Mission: Response uncertain. Your action is saved.',
  )
})

it('uses player-facing delete and restore labels for report preferences', () => {
  for (const hidden of [false, true])
    expect(
      actionLabel({
        type: 'World',
        action: { type: 'SetReportHidden', report: 'report', hidden },
      }),
    ).toBe(hidden ? 'Delete report' : 'Restore report')
})

it('keeps optimistic report actions quiet except for failure and uncertainty', () => {
  for (const status of [
    'submitting',
    'pending',
    'committed',
    'rejected',
    'uncertain',
  ] as const) {
    const report = {
      envelope: {
        command_id: 'report-command',
        command: {
          type: 'World',
          action: { type: 'SetReportHidden', report: 'report', hidden: true },
        },
      },
      status,
      reconciled: false,
      receipt: null,
    } as Attempt
    const message = changedAnnouncements(new Map(), [report]).message
    if (status === 'rejected' || status === 'uncertain')
      expect(message).toContain('Delete report:')
    else expect(message).toBe('')
  }
})
