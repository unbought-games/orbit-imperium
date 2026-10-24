import styles from './reports.module.css'
import { Trash2, RotateCcw } from 'lucide-react'
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
  compact = false,
}: {
  model: Coordinator
  report: string
  hidden: boolean
  disabled: boolean
  onRequest: () => void
  compact?: boolean
}) {
  const visibility = useReportVisibility(model, report)
  return (
    <div className={compact ? styles.compactVisibility : undefined}>
      <Button
        variant={compact ? 'ghost' : 'secondary'}
        size={compact ? 'icon' : undefined}
        aria-label={hidden ? 'Restore report' : 'Delete report'}
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
        {compact ? (
          hidden ? (
            <RotateCcw size={16} aria-hidden="true" />
          ) : (
            <Trash2 size={16} aria-hidden="true" />
          )
        ) : hidden ? (
          'Restore report'
        ) : (
          'Delete report'
        )}
      </Button>
      {visibility.status && <Text role="status">{visibility.status}</Text>}
    </div>
  )
}
