import type { Coordinator } from '../client-model/coordinator'
import { Button } from '../ui/button'
import { Text } from '../ui/typography'
import { useReportVisibility } from './use-report-visibility'

export function ReportVisibilityButton({
  model,
  report,
  hidden,
  disabled,
  onRequest,
}: {
  model: Coordinator
  report: string
  hidden: boolean
  disabled: boolean
  onRequest: () => void
}) {
  const visibility = useReportVisibility(model, report)
  return (
    <div>
      <Button
        variant="secondary"
        disabled={disabled || visibility.disabled}
        title={
          hidden
            ? 'Restore to your reports'
            : 'Remove from your reports; you can restore it later'
        }
        onClick={() => {
          onRequest()
          void visibility.change(!hidden)
        }}
      >
        {hidden ? 'Restore report' : 'Delete report'}
      </Button>
      {visibility.status && <Text role="status">{visibility.status}</Text>}
    </div>
  )
}
