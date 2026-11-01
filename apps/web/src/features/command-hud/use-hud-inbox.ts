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
  const [pageIntent, setPageIntent] = useState<number | null>(null)
  const request = reportLoad(state)
  const changingVisibility = !!pendingReportVisibility(state.attempts.values())
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
  const loading =
    changingVisibility ||
    (!state.reportInbox && request.pending) ||
    (!buffered &&
      (pageIntent !== null || (request.pending && request.kind === 'more')))
  // Only a pagination gesture creates an outstanding page intent. A change in
  // the unread count must not turn the settled display limit into new work.
  useEffect(() => {
    if (pageIntent === null) return
    let active = true
    void (async () => {
      try {
        await model.reports.refreshInbox(true)
        if (active) setLimit((value) => Math.max(value, pageIntent))
      } catch {
        /* Shared request state supplies retry in both surfaces. */
      } finally {
        if (active) setPageIntent(null)
      }
    })()
    return () => {
      active = false
    }
  }, [model, pageIntent])
  const loadTo = (nextLimit: number) => {
    if (!visible || changingVisibility || nextLimit <= limit) return
    if (buffered) setLimit((value) => Math.max(value, nextLimit))
    else setPageIntent(nextLimit)
  }
  const loadMore = () => loadTo(limit + batchSize)
  const latestLoad = useRef(loadTo)
  latestLoad.current = loadTo
  useEffect(() => {
    const element = sentinel.current
    const root = scrollRoot.current
    if (!visible || !more || loading || failed || !element || !root) return
    // A callback queued before this observer disconnects still belongs to this
    // batch; it must not consume whichever batch a later render is showing.
    const nextLimit = limit + batchSize
    let active = true
    const observer = new IntersectionObserver(
      (entries) => {
        if (active && entries.some((entry) => entry.isIntersecting))
          void latestLoad.current(nextLimit)
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
