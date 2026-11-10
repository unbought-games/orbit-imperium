import type { GameState } from '../../client-model/game-store'
import {
  currentServerTime,
  occupiedFleetSlots,
} from '../../client-model/game-projection'
import {
  incomingKey,
  incomingThreats,
  noticeContent,
  noticeKey,
  type HudNotice,
  type HudTarget,
  type NoticeContent,
} from './model'

const lifetimeMs = 7000
const historySize = 3

/** Session-local events and dismissal intent, never copies of game facts. */
export type NotificationHistory = {
  notices: HudNotice[]
  dismissed: string[]
}
export function initialNotificationHistory(
  state: GameState,
): NotificationHistory {
  return {
    notices: incomingThreats(state)
      .slice(0, historySize)
      .map((fleet) => ({
        kind: 'incoming',
        id: incomingKey(fleet),
        shownAt: state.now,
      })),
    dismissed: [],
  }
}
export type NotificationAction =
  | { type: 'arrived'; targets: HudTarget[]; now: number }
  | { type: 'dismissed'; target: HudTarget }
  | { type: 'reset'; state: GameState }
export function notificationHistory(
  history: NotificationHistory,
  action: NotificationAction,
): NotificationHistory {
  if (action.type === 'reset') return initialNotificationHistory(action.state)
  if (action.type === 'dismissed')
    return {
      ...history,
      dismissed: [...history.dismissed.slice(-30), noticeKey(action.target)],
    }
  if (!action.targets.length) return history
  return {
    ...history,
    notices: [
      ...history.notices.filter(
        (notice) => action.now - notice.shownAt < lifetimeMs,
      ),
      ...action.targets.map((target) => ({ ...target, shownAt: action.now })),
    ].slice(-historySize),
  }
}
export function recentNotifications(history: NotificationHistory, now: number) {
  return history.notices
    .filter((notice) => now - notice.shownAt < lifetimeMs)
    .reverse()
}
export function visibleNotifications(
  history: NotificationHistory,
  now: number,
) {
  return recentNotifications(history, now).filter(
    (notice) => !history.dismissed.includes(noticeKey(notice)),
  )
}

/** Prepared presentation data: callers retain the authoritative game state. */
export type HudToastView = {
  target: HudTarget
  content: NoticeContent
  now: number
  freeFleetSlots: string | null
}
export function hudToastViews(
  state: GameState,
  notices: readonly HudNotice[],
): HudToastView[] {
  const used = BigInt(occupiedFleetSlots(state))
  const total = BigInt(
    state.view?.protocol === 4 ? state.view.missions.fleet_slots : '0',
  )
  const free = (total > used ? total - used : 0n).toString()
  return notices.flatMap((target) => {
    const content = noticeContent(state, target)
    if (!content) return []
    return [
      {
        target,
        content,
        now: currentServerTime(state),
        freeFleetSlots:
          target.kind === 'command' &&
          (content.icon === 'fleet' || content.icon === 'spy')
            ? free
            : null,
      },
    ]
  })
}
