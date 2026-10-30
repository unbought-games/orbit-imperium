import styles from './reports.module.css'
import { Archive, Inbox } from 'lucide-react'
import type { Coordinator } from '../client-model/coordinator'
import { Button } from '../ui/button'
import { useStore } from 'zustand'
import { projectedReportHeader } from '../client-model/report-state'
import { useReportVisibility } from './use-report-visibility'

export function ReportVisibilityButton({
  model,
  report,
  hidden,
  disabled,
  compact = false,
}: {
  model: Coordinator
  report: string
  hidden: boolean
  disabled: boolean
  compact?: boolean
}) {
  const visibility = useReportVisibility(model, report)
  const starred = useStore(
    model.store,
    (s) =>
      projectedReportHeader(s.reportHeaders, s.attempts.values(), report)
        ?.starred,
  )

  return (
    <div className={compact ? styles.compactVisibility : undefined}>
      <Button
        variant={compact ? 'ghost' : 'secondary'}
        size={compact ? 'icon' : undefined}
        aria-label={hidden ? 'Move to inbox' : 'Archive report'}
        disabled={disabled || visibility.disabled || (!hidden && !!starred)}
        title={
          starred && !hidden
            ? 'Unstar this report before archiving it'
            : hidden
              ? 'Move to inbox'
              : 'Archive report; move it to inbox anytime'
        }
        onClick={() => {
          void visibility.change(!hidden)
        }}
      >
        {compact ? (
          hidden ? (
            <Inbox size={16} aria-hidden="true" />
          ) : (
            <Archive size={16} aria-hidden="true" />
          )
        ) : hidden ? (
          'Move to inbox'
        ) : (
          'Archive report'
        )}
      </Button>
    </div>
  )
}
