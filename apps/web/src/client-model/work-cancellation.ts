import type { GameState } from './game-store'
import { buildingProgress } from './building-progress'
import { researchProgress } from './research-progress'
import { currentServerTime } from './game-projection'

export type CancellationKind = 'CancelConstruction' | 'CancelResearch'

/** Server timestamps plus this session's monotonic clock; never infer a start
 * from current prices/speed or an optimistic submission. Unknown time is guarded. */
export function workCancellation(
  state: GameState,
  kind: CancellationKind,
  operationId: string | null,
) {
  const view = state.view
  const construction = view?.constructions.find((x) => x.id === operationId)
  const research =
    view && view.protocol !== 2 ? view.progression.research_operation : null
  const confirmed =
    kind === 'CancelConstruction'
      ? construction
      : research?.id === operationId
        ? research
        : null
  const work =
    kind === 'CancelConstruction'
      ? view?.bodies
          .map((body) => buildingProgress(state, body.id))
          .find((entry) => entry?.operationId === operationId)
      : researchProgress(state)
  const startedAt = confirmed?.started_at
  const now = currentServerTime(state)
  const elapsedMs =
    startedAt !== undefined && Number.isFinite(startedAt) && startedAt <= now
      ? Math.max(0, Math.min(now, confirmed!.due_at) - startedAt)
      : null
  return {
    canCancel:
      !!operationId && work?.operationId === operationId && !!work.canCancel,
    elapsedMs,
    requiresConfirmation: elapsedMs === null || elapsedMs >= 30_000,
  }
}

/** Full unit names and no upward rounding: a warning must not exaggerate loss. */
export function formatLostWork(milliseconds: number): string {
  let seconds = Math.floor(Math.max(0, milliseconds) / 1000)
  const parts: string[] = []
  for (const [size, name] of [
    [3600, 'hour'],
    [60, 'minute'],
    [1, 'second'],
  ] as const) {
    const count = Math.floor(seconds / size)
    seconds %= size
    if (count) parts.push(`${count} ${name}${count === 1 ? '' : 's'}`)
  }
  return parts.join(' ') || '0 seconds'
}
