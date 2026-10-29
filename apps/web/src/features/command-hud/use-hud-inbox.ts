import { useEffect, useRef, useState, type RefObject } from 'react'
import type { Coordinator } from '../../client-model/coordinator'
import type { GameState } from '../../client-model/game-store'
import { useReports } from '../use-reports'
import { incomingKey, incomingThreats, noticeKey, unreadTargets } from './model'

const batchSize = 20

/** Local pagination intent only; report and mailbox facts stay in the game store. */
export function useHudInbox(
  model: Coordinator,
  state: GameState,
  visible: boolean,
  scrollRoot: RefObject<HTMLDialogElement | null>,
) {
  const reports = useReports(model, null)
  const [limit, setLimit] = useState(batchSize)
  const sentinel = useRef<HTMLDivElement>(null)
  const reportIds = new Set([
    ...(state.reportInbox?.items ?? []),
    ...(reports.page?.items.map((header) => header.id) ?? []),
  ])
  const targets = [
    ...new Map(
      [
        ...incomingThreats(state)
          .filter((fleet) => fleet.mission !== 'Attack')
          .map((fleet) => ({
            kind: 'incoming' as const,
            id: incomingKey(fleet),
          })),
        ...unreadTargets(state).filter(
          (target) => target.kind !== 'report' || reportIds.has(target.id),
        ),
      ].map((target) => [noticeKey(target), target]),
    ).values(),
  ]
  const more = limit < targets.length || !!reports.page?.has_more
  const buffered = limit < targets.length
  const loading =
    reports.loading || reports.loadingMore || reports.changingVisibility
  const failed =
    reports.error !== null ||
    (!!reports.page?.has_more && !reports.page.next_cursor)
  const loadMore = () => {
    if (loading) return
    const started = limit + batchSize > targets.length && reports.more()
    if (buffered || started) setLimit((value) => value + batchSize)
  }
  const latestLoad = useRef(loadMore)
  latestLoad.current = loadMore
  useEffect(() => {
    const element = sentinel.current
    const root = scrollRoot.current
    if (
      !visible ||
      !more ||
      loading ||
      failed ||
      (!buffered && !reports.canLoadMore) ||
      !element ||
      !root
    )
      return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) latestLoad.current()
      },
      { root, rootMargin: '0px 0px 100px 0px' },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [
    visible,
    more,
    loading,
    failed,
    limit,
    targets.length,
    reports.page?.next_cursor,
    reports.canLoadMore,
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
    retry: () => (reports.canLoadMore ? reports.more() : reports.retry()),
  }
}
