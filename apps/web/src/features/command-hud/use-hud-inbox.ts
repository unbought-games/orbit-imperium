import { useEffect, useRef, useState, type RefObject } from 'react'
import { reportLoad } from '../../client-model/report-engine'
import type { Coordinator } from '../../client-model/coordinator'
import type { GameState } from '../../client-model/game-store'
import { pendingReportVisibility } from '../report-visibility'
import { incomingKey, incomingThreats, noticeKey, unreadTargets } from './model'

const batchSize = 20

/** Local pagination intent only; report and mailbox facts stay in the game store. */
export function useHudInbox(
  model: Coordinator,
  state: GameState,
  visible: boolean,
  scrollRoot: RefObject<HTMLDialogElement | null>,
) {
  const [limit, setLimit] = useState(batchSize)
  const request = reportLoad(state)
  const changingVisibility = !!pendingReportVisibility(state.attempts.values())
  const loading = request.pending || changingVisibility
  const failed = request.kind === 'more' && request.error !== null
  const sentinel = useRef<HTMLDivElement>(null)
  const targets = [
    ...new Map(
      [
        ...incomingThreats(state)
          .filter((fleet) => fleet.mission !== 'Attack')
          .map((fleet) => ({
            kind: 'incoming' as const,
            id: incomingKey(fleet),
          })),
        ...unreadTargets(state),
      ].map((target) => [noticeKey(target), target]),
    ).values(),
  ]
  const more = limit < targets.length || !!state.reportInbox?.has_more
  const buffered = limit < targets.length
  const loadMore = async () => {
    if (!visible || loading) return
    if (buffered) {
      setLimit((value) => Math.max(value, limit + batchSize))
      return
    }
    // A shared request can complete before its observer sees the new limit.
    // Repeated requests from this render all express the same next-page intent.
    try {
      await model.reports.refreshInbox(true)
      setLimit((value) => Math.max(value, limit + batchSize))
    } catch {
      /* Shared request state supplies retry in both surfaces. */
    }
  }
  const latestLoad = useRef(loadMore)
  latestLoad.current = loadMore
  useEffect(() => {
    const element = sentinel.current
    const root = scrollRoot.current
    if (!visible || !more || loading || failed || !element || !root) return
    let active = true
    const observer = new IntersectionObserver(
      (entries) => {
        if (active && entries.some((entry) => entry.isIntersecting))
          latestLoad.current()
      },
      { root, rootMargin: '0px 0px 100px 0px' },
    )
    observer.observe(element)
    return () => {
      // Disconnect does not retract callbacks already queued for delivery.
      active = false
      observer.disconnect()
    }
  }, [
    visible,
    more,
    loading,
    failed,
    limit,
    targets.length,
    state.reportInbox?.next_cursor,
    buffered,
    scrollRoot,
  ])
  return {
    targets: targets.slice(0, limit),
    more,
    loading,
    failed,
    sentinel,
    loadMore,
    retry: loadMore,
  }
}
