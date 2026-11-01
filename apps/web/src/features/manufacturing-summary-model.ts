import type { manufacturingQueue } from '../client-model/manufacturing-queue'
import { elapsedProgress } from './overview-progress'

export function manufacturingSummary(
  queue: ReturnType<typeof manufacturingQueue>,
  now: number,
) {
  const current =
    queue.find((batch) => batch.status === 'Producing') ?? queue[0]
  return {
    current,
    upcoming: queue.filter((batch) => batch.id !== current?.id),
    percent:
      current?.status === 'Producing' &&
      current.due !== undefined &&
      current.unitDuration !== undefined
        ? elapsedProgress(current.due - current.unitDuration, current.due, now)
        : null,
  }
}
