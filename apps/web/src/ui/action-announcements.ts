import type { Attempt, Command } from '../client-model/commands'
import { dispatchFailure } from '../client-model/dispatch-validation'
import { label } from './format'
export function actionLabel(command: Command): string {
  return label(command.type === 'World' ? command.action.type : command.type)
}
export function actionMessage(a: Attempt): string {
  const command = a.envelope.command
  if (
    a.status === 'rejected' &&
    a.receipt?.status === 'Rejected' &&
    command.type === 'World' &&
    command.action.type === 'LaunchFleet'
  )
    return `Fleet not sent: ${dispatchFailure(a.receipt.code, command.action.intent)}`
  return a.status === 'committed'
    ? a.reconciled
      ? 'Action confirmed.'
      : 'Action committed; awaiting updated view.'
    : a.status === 'rejected'
      ? `Action rejected: ${a.receipt?.status === 'Rejected' ? label(a.receipt.code) : ''}`
      : a.status === 'uncertain'
        ? 'Response uncertain. Your action is saved.'
        : a.status === 'pending'
          ? 'Order accepted; awaiting the game result.'
          : 'Submitting action.'
}
export function changedAnnouncements(
  previous: Map<string, string>,
  attempts: Attempt[],
): { current: Map<string, string>; message: string } {
  const current = new Map(
    attempts.map((a) => [
      a.envelope.command_id,
      `${actionLabel(a.envelope.command)}: ${actionMessage(a)}`,
    ]),
  )
  return {
    current,
    message: [...current]
      .filter(([id, text]) => previous.get(id) !== text)
      .map(([, text]) => text)
      .join(' '),
  }
}
