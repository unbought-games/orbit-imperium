import { expect, it } from 'vitest'
import type { Attempt, Command } from '../../client-model/commands'
import {
  actionLabel,
  actionMessage,
  changedAnnouncements,
} from '../../ui/action-announcements'
import { latestProgressionAttempt } from './action-feedback-model'

const target = {
  body: 'planet',
  item: { kind: 'Defense', id: 'RocketLauncher' },
} as const
const command: Command = {
  type: 'StartManufacture',
  body: target.body,
  item: target.item,
  quantity: '4',
  expected_terms_hash: 'a'.repeat(64),
}
function attempt(
  id: string,
  command: Command,
  status: Attempt['status'] = 'committed',
): Extract<Attempt, { envelope: { protocol: 4 } }> {
  return {
    envelope: {
      protocol: 4,
      binding: { account: 'a', player: 'p', universe: 'u', epoch: 'e' },
      presence: null,
      command_id: id,
      command,
    },
    status,
    receipt: null,
    reconciled: status === 'committed',
  }
}

it('uses the last submitted quantity, scoped to the item and body, including a later failed attempt', () => {
  const ordered = attempt('ordered', command)
  const otherBody = attempt('other-body', { ...command, body: 'moon' })
  const otherItem = attempt('other-item', {
    ...command,
    item: { kind: 'Ship', id: 'SmallCargo' },
  })
  const attempts = new Map(
    [ordered, otherBody, otherItem].map((a) => [a.envelope.command_id, a]),
  )
  expect(latestProgressionAttempt(attempts, target)).toBe(ordered)
  expect(actionLabel(ordered.envelope.command)).toBe('4 × Rocket Launcher')
  const rejection = attempt(
    'rejected',
    { ...command, quantity: '2' },
    'rejected',
  )
  attempts.set('rejected', rejection)
  expect(latestProgressionAttempt(attempts, target)).toBe(rejection)
  expect(
    latestProgressionAttempt(attempts, { ...target, body: 'elsewhere' }),
  ).toBeUndefined()
})

it.each(['submitting', 'pending', 'uncertain', 'rejected'] as const)(
  'never calls %s a confirmed order',
  (status) => {
    expect(actionMessage(attempt('a', command, status))).not.toContain(
      'confirmed',
    )
  },
)

it('distinguishes a committed order awaiting its snapshot from the next-order balance', () => {
  const committed = attempt('a', command)
  expect(actionMessage({ ...committed, reconciled: false })).toBe(
    'Order confirmed; awaiting updated resources and queue.',
  )
  expect(actionMessage(committed)).toBe(
    'Order confirmed. Costs shown are for a new order.',
  )
  const announced = changedAnnouncements(new Map(), [committed])
  expect(announced.message).toContain('4 × Rocket Launcher: Order confirmed.')
  expect(changedAnnouncements(announced.current, [committed]).message).toBe('')
  const repeat = {
    ...committed,
    envelope: { ...committed.envelope, command_id: 'b' },
  }
  expect(
    changedAnnouncements(announced.current, [committed, repeat]).message,
  ).toContain('4 × Rocket Launcher: Order confirmed.')
})

it.each([
  [
    { kind: 'Building', id: 'MetalMine' },
    {
      type: 'StartUpgrade',
      body: 'planet',
      building: 'MetalMine',
      expected_terms_hash: 'hash',
    },
  ],
  [
    { kind: 'Building', id: 'MetalMine' },
    {
      type: 'StartDemolition',
      body: 'planet',
      building: 'MetalMine',
      expected_terms_hash: 'hash',
    },
  ],
  [
    { kind: 'Research', id: 'EnergyTechnology' },
    {
      type: 'StartResearch',
      host: 'planet',
      research: 'EnergyTechnology',
      expected_terms_hash: 'hash',
    },
  ],
] as const)('shares the feedback selection for %j', (item, command) => {
  const submitted = attempt('a', command)
  expect(
    latestProgressionAttempt(new Map([['a', submitted]]), {
      body: 'planet',
      item,
    }),
  ).toBe(submitted)
})

it('replaces a construction confirmation with its cancellation result, not an unrelated cancellation', () => {
  const started = attempt('start', {
    type: 'StartUpgrade',
    body: 'planet',
    building: 'MetalMine',
    expected_terms_hash: 'hash',
  })
  started.receipt = {
    protocol: 4,
    binding: started.envelope.binding,
    command_id: 'start',
    status: 'Committed',
    admitted_at: 1,
    executed_at: 1,
    minimum_viewer_revision: '2',
    result_ids: ['operation'],
  }
  const cancelled = attempt(
    'cancel',
    { type: 'CancelConstruction', operation: 'operation' },
    'pending',
  )
  const other = attempt('other', {
    type: 'CancelConstruction',
    operation: 'other-operation',
  })
  const attempts = new Map(
    [started, cancelled, other].map((a) => [a.envelope.command_id, a]),
  )
  expect(
    latestProgressionAttempt(attempts, {
      body: 'planet',
      item: { kind: 'Building', id: 'MetalMine' },
    }),
  ).toBe(cancelled)
})

it.each([
  [
    { kind: 'Building', id: 'MetalMine' },
    {
      type: 'StartUpgrade',
      body: 'planet',
      building: 'MetalMine',
      expected_terms_hash: 'hash',
    },
    'CancelConstruction',
  ],
  [
    { kind: 'Research', id: 'EnergyTechnology' },
    {
      type: 'StartResearch',
      host: 'planet',
      research: 'EnergyTechnology',
      expected_terms_hash: 'hash',
    },
    'CancelResearch',
  ],
] as const)(
  'tracks cancellation of an accepted %j start before and after its receipt arrives',
  (item, command, cancelType) => {
    const started = attempt('start', command, 'pending')
    started.receipt = {
      protocol: 4,
      binding: started.envelope.binding,
      command_id: 'start',
      status: 'Pending',
      admitted_at: 1,
      executed_at: null,
    }
    const cancelled = attempt(
      'cancel',
      { type: cancelType, operation: 'start' },
      'uncertain',
    )
    const unrelated = attempt(
      'other',
      { type: cancelType, operation: 'other-start' },
      'pending',
    )
    const attempts = new Map(
      [started, cancelled, unrelated].map((a) => [a.envelope.command_id, a]),
    )
    expect(latestProgressionAttempt(attempts, { body: 'planet', item })).toBe(
      cancelled,
    )
    const committed = {
      ...started,
      status: 'committed' as const,
      receipt: {
        ...started.receipt,
        status: 'Committed' as const,
        executed_at: 2,
        result_ids: ['operation'],
        minimum_viewer_revision: '2',
      },
    }
    attempts.set('start', committed)
    expect(latestProgressionAttempt(attempts, { body: 'planet', item })).toBe(
      cancelled,
    )
  },
)
