import type { Attempt } from '../client-model/commands'
import {
  preferenceReports,
  reportPreference,
} from '../client-model/report-state'

export function pendingReportVisibility(
  attempts: Iterable<Attempt>,
  report?: string,
) {
  return [...attempts].find((attempt) => {
    const action = reportPreference(attempt.envelope.command)
    return (
      action &&
      action.type !== 'MarkReportRead' &&
      (report === undefined || preferenceReports(action).includes(report)) &&
      attempt.status !== 'rejected' &&
      attempt.status !== 'committed'
    )
  })
}
