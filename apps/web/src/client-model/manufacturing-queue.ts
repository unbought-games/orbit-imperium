import type { BoundView } from './commands'
import type { pendingWork } from './game-projection'

export function manufacturingQueue(
  view: BoundView,
  body: string,
  pending: ReturnType<typeof pendingWork>['manufacturing'] = [],
) {
  const confirmed =
    view.protocol === 2
      ? []
      : view.progression.manufacturing
          .filter((batch) => batch.body === body)
          .sort(
            (a, b) =>
              a.first_start_at - b.first_start_at ||
              a.accepted_at - b.accepted_at ||
              a.id.localeCompare(b.id),
          )
          .map((batch) => ({
            id: batch.id,
            item: batch.item,
            remaining: batch.remaining,
            finalDue: batch.final_due_at,
            unitDuration: batch.unit_duration_ms,
            status: batch.state === 'Producing' ? 'Producing' : 'Queued',
            due:
              batch.state === 'Producing'
                ? batch.next_due_at
                : batch.first_start_at,
          }))
  const submitted = pending
    .filter(
      (entry) =>
        entry.terms.type === 'Manufacture' && entry.terms.body === body,
    )
    .sort((a, b) => a.submittedAt - b.submittedAt)
    .flatMap((entry) =>
      entry.terms.type === 'Manufacture'
        ? [
            {
              id: entry.commandId,
              item: entry.terms.item,
              remaining: entry.terms.quantity,
              status:
                entry.status === 'uncertain'
                  ? 'Awaiting confirmation'
                  : 'Confirming',
              due: undefined,
              finalDue: undefined,
              unitDuration: undefined,
            },
          ]
        : [],
    )
  return [...confirmed, ...submitted]
}

export function manufacturingQueueCompletion(
  queue: ReturnType<typeof manufacturingQueue>,
): number | undefined {
  if (queue.length === 0 || queue.some((batch) => batch.finalDue === undefined))
    return undefined
  return queue.reduce((latest, batch) => Math.max(latest, batch.finalDue!), 0)
}
