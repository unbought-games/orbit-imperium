import {
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type RefObject,
} from 'react'
import { reportLoad } from '../../client-model/report-engine'
import type { Coordinator } from '../../client-model/coordinator'
import type { GameState } from '../../client-model/game-store'
import { pendingReportVisibility } from '../report-visibility'
import { incomingKey, incomingThreats, noticeKey, unreadTargets } from './model'

import { createInboxPagination } from './inbox-pagination'

/** Local pagination intent only; report and mailbox facts stay in the game store. */
export function useHudInbox(
  model: Coordinator,
  state: GameState,
  visible: boolean,
  scrollRoot: RefObject<HTMLDialogElement | null>,
) {
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
  const context = useRef({
    visible,
    changingVisibility,
    targetCount: targets.length,
    hasMore: !!state.reportInbox?.has_more,
  })
  context.current = {
    visible,
    changingVisibility,
    targetCount: targets.length,
    hasMore: !!state.reportInbox?.has_more,
  }
  const pagination = useMemo(
    () =>
      createInboxPagination({
        context: () => context.current,
        request: () => model.reports.refreshInbox(true),
      }),
    [model],
  )
  const { limit, pageIntent } = useSyncExternalStore(
    pagination.subscribe,
    pagination.snapshot,
    pagination.snapshot,
  )
  useEffect(() => pagination.cancel, [pagination])
  const more = limit < targets.length || !!state.reportInbox?.has_more
  const buffered = limit < targets.length
  const loading =
    changingVisibility ||
    (!state.reportInbox && request.pending) ||
    pageIntent !== null ||
    (!buffered && request.pending && request.kind === 'more')
  useEffect(() => {
    const element = sentinel.current
    const root = scrollRoot.current
    if (!visible || !more || loading || failed || !element || !root) return
    // A callback queued before this observer disconnects still belongs to this
    // batch; it must not consume whichever batch a later render is showing.
    const observation = pagination.observation()
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting))
          void observation.intersect()
      },
      { root, rootMargin: '0px 0px 100px 0px' },
    )
    observer.observe(element)
    return () => {
      // Disconnect does not retract callbacks already queued for delivery.
      observation.disconnect()
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
    pagination,
  ])
  return {
    targets: targets.slice(0, limit),
    more,
    loading,
    failed,
    sentinel,
    loadMore: pagination.loadMore,
    retry: pagination.loadMore,
  }
}
