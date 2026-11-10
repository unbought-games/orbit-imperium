import { expect, it, vi } from 'vitest'
import { SettingsAction } from './settings-action'
import { readyFixture } from '../test-support/bootstrap'
import { createGameStore } from '../client-model/game-store'
import type { Attempt, Command } from '../client-model/commands'
import {
  deletionState,
  vacationState,
  canSubmitVacation,
  empireDeletionCommand,
} from './settings-state'

const unavailable = 'Reconnect and try again.'
const enter: Command = { type: 'World', action: { type: 'EnterVacation' } }

it('admits only one concurrent command and rechecks eligibility for each new submission', async () => {
  let resolve!: (id: string) => void
  const result = new Promise<string>((done) => {
    resolve = done
  })
  const send = vi.fn(() => result)
  const action = new SettingsAction(
    { ready: true, message: '', send },
    unavailable,
  )
  let eligible = true
  const first = action.submit(enter, () => eligible)
  expect(action.store.getState()).toEqual({ submitting: true, error: '' })
  await action.submit(enter, () => eligible)
  expect(send).toHaveBeenCalledTimes(1)
  resolve('one')
  expect(await first).toBe('one')
  expect(action.store.getState().submitting).toBe(false)
  eligible = false
  await action.submit(enter, () => eligible)
  expect(send).toHaveBeenCalledTimes(1)
})

it('does not admit commands before the authoritative coordinator is ready', async () => {
  const send = vi.fn()
  const action = new SettingsAction(
    { ready: false, message: '', send },
    unavailable,
  )
  await action.submit(enter, () => true)
  expect(send).not.toHaveBeenCalled()
  expect(action.store.getState()).toEqual({ submitting: false, error: '' })
})

it('surfaces refusal and transport failure while releasing its local submission state', async () => {
  const send = vi
    .fn()
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(Error('offline'))
    .mockResolvedValueOnce('retry')
  const action = new SettingsAction(
    { ready: true, message: 'Session expired.', send },
    unavailable,
  )
  await action.submit(enter, () => true)
  expect(action.store.getState()).toEqual({
    submitting: false,
    error: 'Session expired.',
  })
  await action.submit(enter, () => true)
  expect(action.store.getState()).toEqual({
    submitting: false,
    error: unavailable,
  })
  expect(await action.submit(enter, () => true)).toBe('retry')
  expect(action.store.getState()).toEqual({ submitting: false, error: '' })
})

function state() {
  const { snapshot } = readyFixture(4)
  if (snapshot.view.protocol !== 4) throw Error('fixture')
  return {
    ...createGameStore().getState(),
    ready: true,
    binding: snapshot.view.binding,
    view: snapshot.view,
    receivedAt: 100,
    now: 100,
  }
}
function attempt(
  command: Command,
  status: Attempt['status'] = 'pending',
): Attempt {
  const binding = state().binding
  return {
    envelope: {
      protocol: 4,
      binding,
      command_id: 'command',
      presence: null,
      command,
    },
    status,
    receipt: null,
    reconciled: false,
  }
}

it('derives the vacation exit boundary from authoritative sampled time without changing vacation state', () => {
  const s = state()
  const vacation = {
    active: true,
    entered_at: 0,
    earliest_exit_at: 48 * 60 * 60 * 1000,
    blockers: [],
  }
  s.view.vacation = vacation
  s.view.sampled_at = vacation.earliest_exit_at - 1
  expect(vacationState(s).canExit).toBe(false)
  s.now++
  expect(vacationState(s).canExit).toBe(true)
  expect(s.view.vacation).toBe(vacation)
  expect(s.view.vacation.active).toBe(true)
  s.view.vacation = { ...vacation, active: false }
  expect(vacationState(s).canExit).toBe(false)
  s.view.vacation = { ...vacation, earliest_exit_at: null }
  expect(vacationState(s).canExit).toBe(true)
})

it('tracks the latest vacation action through pending, rejection and reconciliation', () => {
  const s = state()
  s.attempts.set('old', attempt(enter, 'rejected'))
  s.attempts.set(
    'new',
    attempt({ type: 'World', action: { type: 'ExitVacation' } }),
  )
  s.attempts.set(
    'unrelated',
    attempt({ type: 'World', action: { type: 'RequestEmpireDeletion' } }),
  )
  expect(vacationState(s)).toMatchObject({ pending: true, failed: false })
  s.attempts.get('new')!.status = 'rejected'
  expect(vacationState(s)).toMatchObject({ pending: false, failed: true })
  s.attempts.get('new')!.status = 'committed'
  s.attempts.get('new')!.reconciled = true
  expect(vacationState(s)).toMatchObject({ pending: false, failed: false })
})

it('deletion observes its own keep-presence attempt without adopting unrelated presence failures', () => {
  const s = state()
  const presence: Command = {
    type: 'World',
    action: {
      type: 'RecordForegroundPresence',
      cause: 'AccountVisit',
      body: null,
      paired_command_id: null,
    },
  }
  const requested = attempt(
    { type: 'World', action: { type: 'RequestEmpireDeletion' } },
    'committed',
  )
  requested.reconciled = true
  s.attempts.set('deletion', requested)
  const keep = attempt(presence)
  keep.envelope.command_id = 'keep'
  s.attempts.set('keep', keep)
  expect(deletionState(s)).toMatchObject({ pending: false, failed: false })
  expect(deletionState(s, 'keep')).toMatchObject({
    pending: true,
    failed: false,
  })
  keep.status = 'rejected'
  expect(deletionState(s, 'keep')).toMatchObject({
    pending: false,
    failed: true,
  })
})

it('rechecks vacation presence, blockers, pending receipts and exit eligibility from current state', () => {
  const s = state()
  expect(canSubmitVacation(s, true)).toBe(false)
  s.view.vacation = {
    active: false,
    entered_at: null,
    earliest_exit_at: null,
    blockers: [],
  }
  expect(canSubmitVacation(s, true)).toBe(true)
  expect(canSubmitVacation(s, false)).toBe(false)
  s.view.vacation.blockers = [{ kind: 'Research', body: null }]
  expect(canSubmitVacation(s, true)).toBe(false)
  s.view.vacation.blockers = []
  s.attempts.set('pending', attempt(enter))
  expect(canSubmitVacation(s, true)).toBe(false)
  s.attempts.clear()
  s.view.vacation = {
    active: true,
    entered_at: 0,
    earliest_exit_at: s.view.sampled_at,
    blockers: [],
  }
  expect(canSubmitVacation(s, true)).toBe(false)
  expect(canSubmitVacation(s, false)).toBe(true)
})

it('retains authoritative vacation and deletion rejection explanations', () => {
  for (const [action, code, message] of [
    [
      'EnterVacation',
      'VacationBlocked',
      'Review your current fleets and unfinished work',
    ],
    ['ExitVacation', 'VacationMinimum', '48-hour minimum'],
    [
      'RequestEmpireDeletion',
      'ReauthenticationRequired',
      'Sign out and sign in again',
    ],
    ['RequestEmpireDeletion', 'AllianceLeader', 'Transfer alliance leadership'],
    ['CancelEmpireDeletion', 'DeletionDue', 'deletion deadline has passed'],
  ] as const) {
    const s = state()
    const rejected = attempt(
      { type: 'World', action: { type: action } },
      'rejected',
    )
    rejected.receipt = {
      protocol: 4,
      binding: s.binding,
      command_id: 'command',
      admitted_at: 1000,
      executed_at: 1000,
      status: 'Rejected',
      code,
    }
    s.attempts.set('command', rejected)
    const result =
      action === 'EnterVacation' || action === 'ExitVacation'
        ? vacationState(s)
        : deletionState(s)
    expect(result.failed).toBe(true)
    expect(result.pending).toBe(false)
    expect(result.message).toContain(message)
  }
})

it('maps deletion controls to account-scoped commands without a planet or paired action', () => {
  expect(empireDeletionCommand('request')).toEqual({
    type: 'World',
    action: { type: 'RequestEmpireDeletion' },
  })
  expect(empireDeletionCommand('cancel')).toEqual({
    type: 'World',
    action: { type: 'CancelEmpireDeletion' },
  })
  expect(empireDeletionCommand('keep')).toEqual({
    type: 'World',
    action: {
      type: 'RecordForegroundPresence',
      body: null,
      cause: 'AccountVisit',
      paired_command_id: null,
    },
  })
})
