import styles from './reports.module.css'
import { Archive, Inbox } from 'lucide-react'
import type { Coordinator } from '../client-model/coordinator'
import { Button } from '../ui/button'
import { useStore } from 'zustand'
import { projectedReportHeader } from '../client-model/report-state'
import { useReportVisibility } from './use-report-visibility'
import { useReportArchiveShortcut } from './use-report-archive-shortcut'

export function ReportVisibilityButton({
  model,
  report,
  hidden,
  disabled,
  compact = false,
  onCommitted,
  archiveShortcut = false,
}: {
  model: Coordinator
  report: string
  hidden: boolean
  disabled: boolean
  compact?: boolean
  onCommitted?: (hidden: boolean) => void
  archiveShortcut?: boolean
}) {
  const archiveButton = useReportArchiveShortcut(archiveShortcut && !hidden)
  const visibility = useReportVisibility(model, report, onCommitted)
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
        size={compact ? 'icon-touch' : undefined}
        aria-label={hidden ? 'Move to inbox' : 'Archive report'}
        ref={archiveButton}
        aria-keyshortcuts={archiveShortcut && !hidden ? 'e' : undefined}
        disabled={disabled || visibility.disabled || (!hidden && !!starred)}
        title={
          starred && !hidden
            ? 'Unstar this report before archiving it'
            : hidden
              ? 'Move to inbox'
              : `Move to Archived${archiveShortcut ? ' (E)' : ''}; you can move it back to Inbox`
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
