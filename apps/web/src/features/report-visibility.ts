import type { Attempt } from '../client-model/commands'

export function pendingReportVisibility(
  attempts: Iterable<Attempt>,
  report?: string,
) {
  return [...attempts].find((attempt) => {
    const command = attempt.envelope.command
    return (
      command.type === 'World' &&
      command.action.type === 'SetReportHidden' &&
      (report === undefined || command.action.report === report) &&
      attempt.status !== 'rejected' &&
      attempt.status !== 'committed'
    )
  })
}
