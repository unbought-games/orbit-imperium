import { createIntelligenceRefresh } from './intelligence-refresh'
import {
  reportLoad,
  reportRequestScope,
} from '../../client-model/report-engine'
import { useOrbCaption } from './use-orb-caption'
import { useEffect, useRef, useState, useReducer } from 'react'
import { useStore } from 'zustand'
import type { Coordinator } from '../../client-model/coordinator'
import { changedHudTargets, type HudTarget } from './model'

import {
  initialNotificationHistory,
  notificationHistory,
  recentNotifications,
  visibleNotifications,
} from './notification-history'

/** This hook stores only interaction history/IDs; all game facts come from the game store. */
export function useCommandHud(model: Coordinator) {
  const state = useStore(model.store)
  const caption = useOrbCaption(model)
  const [history, dispatch] = useReducer(
    notificationHistory,
    state,
    initialNotificationHistory,
  )
  const [selection, select] = useState<HudTarget | 'inbox' | null>(null)
  const expanded = useRef(false)
  expanded.current = selection !== null
  const [mailboxError, setMailboxError] = useState('')
  const refresh = useRef<() => void>(() => {})
  useEffect(() => {
    let before = model.store.getState()
    dispatch({ type: 'reset', state: before })
    const stop = model.subscribe((after) => {
      const targets = changedHudTargets(before, after)
      before = after
      if (targets.length) dispatch({ type: 'arrived', targets, now: after.now })
    })
    return stop
  }, [model])
  useEffect(() => {
    const controller = createIntelligenceRefresh({
      available: () => !document.hidden && model.ready && !model.stale,
      reports: () => model.reports.refreshInbox(false, expanded.current),
      mailbox: () => model.refreshMailbox(),
      onMailboxError: setMailboxError,
    })
    const load = () => void controller.refresh()
    refresh.current = load
    load()
    let scope = reportRequestScope(model.store.getState())
    const stop = model.subscribe((next) => {
      if (reportRequestScope(next) !== scope) {
        scope = reportRequestScope(next)
        void load()
      }
    })
    const timer = window.setInterval(() => void load(), 15000)
    const wake = () => void load()
    window.addEventListener('focus', wake)
    document.addEventListener('visibilitychange', wake)
    return () => {
      controller.dispose()
      stop()
      clearInterval(timer)
      window.removeEventListener('focus', wake)
      document.removeEventListener('visibilitychange', wake)
    }
  }, [model])
  const recent = recentNotifications(history, state.now)
  return {
    state,
    caption,
    recent,
    toasts: visibleNotifications(history, state.now),
    selection,
    select,
    inboxError:
      mailboxError ||
      (reportLoad(state).kind !== 'more' && reportLoad(state).error
        ? 'Some intelligence is unavailable. Try again.'
        : ''),
    retry: () => refresh.current(),
    dismiss: (target: HudTarget) => dispatch({ type: 'dismissed', target }),
  }
}
export type CommandHudState = ReturnType<typeof useCommandHud>
