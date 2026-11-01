import { Archive } from 'lucide-react'
import type { components } from '../contracts'
import { Button } from '../ui/button'
import type { useReportCleanup } from './use-report-cleanup'

export function ReportArchiveAll({
  reports,
  cleanup,
  complete,
  disabled,
}: {
  reports: components['schemas']['ReportHeader4'][]
  cleanup: ReturnType<typeof useReportCleanup>
  complete: boolean
  disabled: boolean
}) {
  const eligible = reports.filter((report) => !report.hidden && !report.starred)
  return (
    <Button
      variant="secondary"
      title="Archive all unstarred Inbox reports, regardless of age or filters"
      size="compact"
      disabled={
        disabled ||
        !complete ||
        cleanup.submitting ||
        cleanup.coolingDown ||
        !eligible.length
      }
      onClick={() => void cleanup.remove(eligible)}
    >
      <Archive size={16} aria-hidden="true" />
      {complete ? `Archive all (${eligible.length})` : 'Loading reports…'}
    </Button>
  )
}
