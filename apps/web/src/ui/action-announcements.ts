import type { Attempt, Command } from '../client-model/commands'
import { dispatchFailure } from '../client-model/dispatch-validation'
import { label } from './format'
// Report preferences update optimistically; only failures need announcement.
// Presence uses the durable command ledger, but uncertainty is resolved by
// delivery reconciliation without asking the player to confirm an internal action.
// Keep actual rejections visible, including presence failures.
export function visibleAction(a: Attempt): boolean {
  const command = a.envelope.command
  if (
    command.type === 'World' &&
    (command.action.type === 'SetReportHidden' ||
      command.action.type === 'SetReportsHidden' ||
      command.action.type === 'SetReportStarred')
  )
    return a.status === 'uncertain' || a.status === 'rejected'
  return (
    command.type !== 'World' ||
    command.action.type !== 'RecordForegroundPresence' ||
    a.status === 'rejected'
  )
}
export function actionLabel(command: Command): string {
  if (command.type === 'World' && command.action.type === 'SetReportStarred')
    return command.action.starred ? 'Star report' : 'Unstar report'
  if (command.type === 'World' && command.action.type === 'SetReportsHidden')
    return command.action.hidden ? 'Archive reports' : 'Move reports to inbox'
  if (command.type === 'StartManufacture')
    return `${command.quantity} × ${label(command.item.id)}`
  if (command.type === 'World' && command.action.type === 'SetReportHidden')
    return command.action.hidden ? 'Archive report' : 'Move to inbox'
  return label(command.type === 'World' ? command.action.type : command.type)
}
export function actionMessage(a: Attempt): string {
  const command = a.envelope.command
  if (command.type === 'StartManufacture' && a.status === 'committed')
    return a.reconciled
      ? 'Order confirmed. Costs shown are for a new order.'
      : 'Order confirmed; awaiting updated resources and queue.'
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
        ? 'We’re checking whether this order went through.'
        : a.status === 'pending'
          ? 'Order accepted; awaiting the game result.'
          : 'Submitting action.'
}
export function changedAnnouncements(
  previous: Map<string, string>,
  attempts: Attempt[],
): { current: Map<string, string>; message: string } {
  const current = new Map(
    attempts
      .filter(visibleAction)
      .map((a) => [
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
