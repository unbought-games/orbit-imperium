import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import type { Attempt } from '../client-model/commands'
import type { components } from '../contracts'
import { createGameStore, type GameState } from '../client-model/game-store'
import type { Coordinator } from '../client-model/coordinator'
import { changedAnnouncements } from './action-announcements'
import { ErrorBanner } from './error-banner'
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'

async function render(
  attempts: Attempt[],
  message = '',
  state: Partial<GameState> = {},
) {
  const store = createGameStore()
  store.setState(state)
  const model = {
    store,
    message,
    ledger: new Map(
      attempts.map((attempt) => [attempt.envelope.command_id, attempt]),
    ),
  } as Coordinator
  const routeTree = createRootRoute({
    component: () => createElement(ErrorBanner, { model }),
  })
  const router = createRouter({ routeTree, history: createMemoryHistory() })
  await router.load()
  return renderToStaticMarkup(createElement(RouterProvider, { router }))
}
function attempt(
  status: Attempt['status'],
  commandId: string,
): components['schemas']['Attempt3'] {
  return {
    envelope: {
      protocol: 3,
      binding: {
        account: 'account',
        player: 'player',
        universe: 'universe',
        epoch: 'epoch',
      },
      command_id: commandId,
      command: {
        type: 'StartUpgrade',
        body: 'planet',
        building: 'MetalMine',
        expected_terms_hash: 'a'.repeat(64),
      },
    },
    status,
    reconciled: status === 'committed' || status === 'rejected',
    receipt:
      status === 'rejected'
        ? {
            protocol: 3,
            binding: {
              account: 'account',
              player: 'player',
              universe: 'universe',
              epoch: 'epoch',
            },
            command_id: commandId,
            admitted_at: 1,
            executed_at: 1,
            status: 'Rejected',
            code: 'InsufficientResources',
          }
        : null,
  }
}
it('removes successful command history from every viewport', async () => {
  const html = await render([attempt('committed', 'done')])
  expect(html).not.toContain('Action log')
  expect(html).not.toContain('View action')
  expect(html).not.toContain('Dismiss outcome')
  expect(html).not.toContain('Action confirmed.')
})
it('keeps rejection and uncertain delivery actionable without displaying history', async () => {
  const rejected = await render([
    attempt('committed', 'done'),
    attempt('rejected', 'failed'),
  ])
  expect(rejected).toContain('Action rejected: Insufficient Resources')
  expect(rejected).toContain('Dismiss notice')
  expect(rejected).not.toContain('View action')
  const uncertain = await render([attempt('uncertain', 'unknown')])
  expect(uncertain).toContain('Retry order')
})

it('keeps local validation and persistence failures visible before a command is sent', async () => {
  const html = await render(
    [],
    'Unable to save action. Free local storage and try again.',
  )
  expect(html).toContain('Action needs attention')
  expect(html).toContain('Unable to save action.')
  expect(html).toContain('Dismiss message')
})

it.each(['RecallMission', 'MarkReportRead'] as const)(
  'identifies a protocol-4 %s failure by its inner action',
  async (type) => {
    const prior = attempt('uncertain', 'world')
    const world: components['schemas']['GameAttempt'] = {
      envelope: {
        ...prior.envelope,
        protocol: 4,
        presence: null,
        command: {
          type: 'World',
          action:
            type === 'RecallMission'
              ? { type, fleet: 'fleet' }
              : { type, report: 'report' },
        },
      },
      status: 'uncertain',
      receipt: null,
      reconciled: false,
    }
    const html = await render([world])
    expect(html).toContain(
      type === 'RecallMission' ? 'Recall Mission' : 'Mark Report Read',
    )
    expect(html).not.toContain('<strong>World</strong>')
  },
)

it.each(['rejected', 'uncertain'] as const)(
  'keeps a new validation error visible alongside an older %s attempt',
  async (status) => {
    const html = await render(
      [attempt(status, 'older')],
      'This quote no longer matches the action. Review it again.',
    )
    expect(html).toContain('This quote no longer matches the action.')
    expect(html).toContain(
      status === 'rejected'
        ? 'Action rejected'
        : 'We’re checking whether this order went through',
    )
    expect(html).toContain(
      status === 'rejected' ? 'Dismiss notice' : 'Retry order',
    )
    expect(html).toContain('Dismiss message')
  },
)

it('resolves uncertain presence quietly without hiding player actions or actual rejections', async () => {
  const prior = attempt('uncertain', 'presence')
  const presence: Attempt = {
    status: 'uncertain',
    receipt: null,
    reconciled: false,
    envelope: {
      ...prior.envelope,
      protocol: 4,
      presence: null,
      command: {
        type: 'World',
        action: {
          type: 'RecordForegroundPresence',
          body: null,
          cause: 'BodyVisit',
          paired_command_id: null,
        },
      },
    },
  }
  expect(changedAnnouncements(new Map(), [presence]).message).toBe('')
  const quiet = await render([presence])
  expect(quiet).not.toContain('Retry order')
  expect(quiet).not.toContain('Action needs attention')
  const mixed = await render([attempt('uncertain', 'upgrade'), presence])
  expect(mixed).toContain('Start Upgrade')
  expect(mixed).toContain('Retry order')
  expect(mixed).not.toContain('Record Foreground Presence')
  const rejected = await render([{ ...presence, status: 'rejected' }])
  expect(rejected).toContain('Record Foreground Presence')
  expect(rejected).toContain('Action rejected')
})

it('puts connection and action failures in one banner while preserving recovery', async () => {
  const html = await render(
    [attempt('uncertain', 'unknown')],
    'Unable to save action.',
    {
      stale: true,
      connectionInterrupted: true,
    },
  )
  expect(html.match(/data-testid="game-error-banner"/g)).toHaveLength(1)
  expect(html).toContain('Connection lost. Reconnecting')
  expect(html).toContain('Unable to save action.')
  expect(html).toContain('Retry order')
  expect(html).toContain('Dismiss message')
})
it('keeps older failures accessible in the same banner', async () => {
  const html = await render([
    attempt('rejected', 'older'),
    attempt('uncertain', 'newer'),
  ])
  expect(html).toContain('1 more order needs attention')
  expect(html).toContain('Action rejected: Insufficient Resources')
  expect(html).toContain('Retry order')
  expect(html).toContain('Dismiss notice')
})
