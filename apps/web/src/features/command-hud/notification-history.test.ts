import { expect, it } from 'vitest'
import { createGameStore } from '../../client-model/game-store'
import { bootstrapFixture } from '../../test-support/bootstrap'
import {
  hudToastViews,
  initialNotificationHistory,
  notificationHistory,
  recentNotifications,
  visibleNotifications,
  type NotificationHistory,
} from './notification-history'
import { incomingKey, orbAppearance, type HudTarget } from './model'

const command = (id: string): HudTarget => ({ kind: 'command', id })
const empty = (): NotificationHistory => ({ notices: [], dismissed: [] })
it('rapid arrivals retain the newest three events in reverse arrival order, including batched arrivals', () => {
  let history = empty()
  for (let i = 1; i <= 14; i++)
    history = notificationHistory(history, {
      type: 'arrived',
      targets: [command(String(i))],
      now: i * 10,
    })
  expect(visibleNotifications(history, 140).map((n) => n.id)).toEqual([
    '14',
    '13',
    '12',
  ])
  history = notificationHistory(history, {
    type: 'arrived',
    targets: ['15', '16', '17', '18'].map(command),
    now: 150,
  })
  expect(visibleNotifications(history, 150).map((n) => n.id)).toEqual([
    '18',
    '17',
    '16',
  ])
})
it('dismissal promotes the next card but still consumes event history until it rolls off', () => {
  let history = notificationHistory(empty(), {
    type: 'arrived',
    targets: ['1', '2', '3'].map(command),
    now: 0,
  })
  history = notificationHistory(history, {
    type: 'dismissed',
    target: command('3'),
  })
  expect(visibleNotifications(history, 1).map((n) => n.id)).toEqual(['2', '1'])
  for (const id of ['4', '5']) {
    history = notificationHistory(history, {
      type: 'arrived',
      targets: [command(id)],
      now: 2,
    })
    expect(visibleNotifications(history, 2)).toHaveLength(2)
  }
  history = notificationHistory(history, {
    type: 'arrived',
    targets: [command('6')],
    now: 3,
  })
  expect(visibleNotifications(history, 3).map((n) => n.id)).toEqual([
    '6',
    '5',
    '4',
  ])
  expect(recentNotifications(history, 3).map((n) => n.id)).toEqual([
    '6',
    '5',
    '4',
  ])
})
it('expires at seven seconds without another event, and appending never revives expired history', () => {
  let history = notificationHistory(empty(), {
    type: 'arrived',
    targets: [command('old')],
    now: 100,
  })
  expect(visibleNotifications(history, 7099)).toHaveLength(1)
  expect(visibleNotifications(history, 7100)).toEqual([])
  history = notificationHistory(history, {
    type: 'arrived',
    targets: [command('new')],
    now: 7100,
  })
  expect(history.notices.map((n) => n.id)).toEqual(['new'])
  expect(visibleNotifications(history, 14100)).toEqual([])
})
it('dismissal and expiry never remove authoritative threats or persistent unread state', () => {
  const { result } = bootstrapFixture(4)
  if (
    result.status !== 'authenticated' ||
    result.game.status !== 'ready' ||
    result.game.snapshot.view.protocol !== 4
  )
    throw Error('Expected ready fixture')
  const view = result.game.snapshot.view
  const attack = {
    sender: 'enemy',
    origin: { galaxy: 1, system: 2, position: 3 },
    target: 'home',
    mission: 'Attack' as const,
    arrival_at: 10000,
    ships: { visibility: 'Unknown' as const },
  }
  view.missions.incoming = [attack]
  const state = { ...createGameStore().getState(), view, now: 0 }
  let history = initialNotificationHistory(state)
  expect(history.notices).toEqual([
    { kind: 'incoming', id: incomingKey(attack), shownAt: 0 },
  ])
  history = notificationHistory(history, {
    type: 'dismissed',
    target: history.notices[0],
  })
  expect(visibleNotifications(history, 1)).toEqual([])
  expect(recentNotifications(history, 1)).toHaveLength(1)
  expect(orbAppearance(state, recentNotifications(history, 7000))).toEqual({
    tone: 'red',
    icon: 'attack',
  })
  history = notificationHistory(history, {
    type: 'reset',
    state: { ...state, view: null },
  })
  expect(history).toEqual(empty())
})
it('missing content is removed before assigning depth, and prepared content follows current game facts', () => {
  const state = createGameStore().getState()
  state.mailbox = {
    conversations: [],
    circulars: [
      {
        id: 'live',
        alliance: 'a',
        alliance_name: 'Alliance',
        alliance_tag: 'TAG',
        sender: 'sender',
        sender_name: 'Nova',
        body: 'hello',
        sent_at: 1,
        read: false,
      },
    ],
  }
  const notices = [
    { kind: 'command' as const, id: 'missing', shownAt: 0 },
    { kind: 'circular' as const, id: 'live', shownAt: 0 },
  ]
  const views = hudToastViews(state, notices)
  expect(views.map((notice) => notice.target.id)).toEqual(['live'])
  expect(views[0].content).toMatchObject({
    title: 'Alliance transmission',
    detail: '[TAG] Nova · Tap to read',
  })
  state.mailbox.circulars[0].sender_name = 'Orion'
  expect(hudToastViews(state, notices)[0].content.detail).toBe(
    '[TAG] Orion · Tap to read',
  )
  state.mailbox.circulars = []
  expect(hudToastViews(state, notices)).toEqual([])
})
