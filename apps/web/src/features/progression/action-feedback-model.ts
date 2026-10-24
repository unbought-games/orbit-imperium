import type { AttemptLedger } from '../../client-model/commands'
import type { components } from '../../contracts'

export type ActionTarget = {
  body: string
  item: {
    kind: components['schemas']['CatalogEntry3']['key']['kind']
    id: string
  }
}

export function latestProgressionAttempt(
  attempts: AttemptLedger,
  { body, item }: ActionTarget,
) {
  const orders = [...attempts.values()].filter((attempt) => {
    const command = attempt.envelope.command
    switch (command.type) {
      case 'StartManufacture':
        return (
          command.body === body &&
          command.item.kind === item.kind &&
          command.item.id === item.id
        )
      case 'StartUpgrade':
      case 'StartDemolition':
        return (
          command.body === body &&
          item.kind === 'Building' &&
          command.building === item.id
        )
      case 'StartResearch':
        return (
          command.host === body &&
          item.kind === 'Research' &&
          command.research === item.id
        )
      default:
        return false
    }
  })
  // A cancellation of one of these orders supersedes its earlier confirmation.
  // Before execution, cancellation uses the accepted start command ID as an
  // alias. Keep that relationship after its committed operation IDs arrive.
  const operations = new Set(
    orders.flatMap((attempt) => [
      attempt.envelope.command_id,
      ...(attempt.receipt?.status === 'Committed'
        ? attempt.receipt.result_ids
        : []),
    ]),
  )
  return [...attempts.values()]
    .filter((attempt) => {
      const command = attempt.envelope.command
      return (
        orders.includes(attempt) ||
        ((command.type === 'CancelConstruction' ||
          command.type === 'CancelResearch') &&
          operations.has(command.operation))
      )
    })
    .at(-1)
}
