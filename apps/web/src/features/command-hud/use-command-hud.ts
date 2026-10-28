import { readHudReports } from './read-hud-reports'
import { useEffect, useRef, useState } from 'react'
import { useStore } from 'zustand'
import type { Coordinator } from '../../client-model/coordinator'
import {
  changedHudTargets,
  noticeKey,
  incomingThreats,
  incomingKey,
  type HudNotice,
  type HudTarget,
} from './model'

/** This hook stores only interaction history/IDs; all game facts come from the game store. */
export function useCommandHud(model: Coordinator) {
  const state = useStore(model.store)
  const [notices, setNotices] = useState<HudNotice[]>([])
  const [dismissed, setDismissed] = useState<string[]>([])
  const [selection, select] = useState<HudTarget | 'inbox' | null>(null)
  const [inboxError, setInboxError] = useState('')
  const refresh = useRef<() => void>(() => {})
  useEffect(() => {
    let before = model.store.getState()
    // Existing threats matter immediately; historic actions and messages don't toast on login.
    setNotices(
      incomingThreats(before)
        .slice(0, 3)
        .map((f) => ({
          kind: 'incoming',
          id: incomingKey(f),
          shownAt: before.now,
        })),
    )
    const stop = model.subscribe((after) => {
      const targets = changedHudTargets(before, after)
      before = after
      if (targets.length)
        setNotices((old) =>
          [
            ...old.filter((n) => after.now - n.shownAt < 7000),
            ...targets.map((target) => ({ ...target, shownAt: after.now })),
          ].slice(-3),
        )
    })
    return stop
  }, [model])
  useEffect(() => {
    let active = true,
      busy = false,
      again = false
    async function load() {
      if (!active || document.hidden || !model.ready || model.stale) return
      if (busy) {
        again = true
        return
      }
      busy = true
      const results = await Promise.allSettled([
        readHudReports((cursor) =>
          active ? model.reportPage(cursor) : Promise.resolve(null),
        ),
        model.refreshMailbox(),
      ])
      if (active)
        setInboxError(
          results.some(
            (r) =>
              r.status === 'rejected' ||
              (r.status === 'fulfilled' && r.value === null),
          )
            ? 'Some intelligence is unavailable. Try again.'
            : '',
        )
      busy = false
      if (again && active) {
        again = false
        void load()
      }
    }
    refresh.current = () => void load()
    void load()
    let revision = model.view?.viewer_revision
    const stop = model.subscribe((next) => {
      if (next.view?.viewer_revision !== revision) {
        revision = next.view?.viewer_revision
        void load()
      }
    })
    const timer = window.setInterval(() => void load(), 15000)
    const wake = () => void load()
    window.addEventListener('focus', wake)
    document.addEventListener('visibilitychange', wake)
    return () => {
      active = false
      stop()
      clearInterval(timer)
      window.removeEventListener('focus', wake)
      document.removeEventListener('visibilitychange', wake)
    }
  }, [model])
  const recent = notices.filter((n) => state.now - n.shownAt < 7000).reverse()
  return {
    state,
    recent,
    toasts: recent.filter((n) => !dismissed.includes(noticeKey(n))),
    selection,
    select,
    inboxError,
    retry: () => refresh.current(),
    dismiss: (target: HudTarget) =>
      setDismissed((old) => [...old.slice(-30), noticeKey(target)]),
  }
}
export type CommandHudState = ReturnType<typeof useCommandHud>
