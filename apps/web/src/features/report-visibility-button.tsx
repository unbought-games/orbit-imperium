import styles from './reports.module.css'
import { Archive, Inbox } from 'lucide-react'
import type { Coordinator } from '../client-model/coordinator'
import { Button } from '../ui/button'
import { ConfirmationButton } from '../ui/confirmation-button'
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
  detail,
}: {
  model: Coordinator
  report: string
  hidden: boolean
  disabled: boolean
  compact?: boolean
  onCommitted?: (hidden: boolean) => void
  detail?: { shared: boolean }
}) {
  const archiveButton = useReportArchiveShortcut(!!detail && !hidden)
  const visibility = useReportVisibility(model, report, onCommitted)
  const starred = useStore(
    model.store,
    (s) =>
      projectedReportHeader(s.reportHeaders, s.attempts.values(), report)
        ?.starred,
  )

  if (detail && !hidden)
    return (
      <div className={styles.compactVisibility}>
        <ConfirmationButton
          variant="ghost"
          size="icon-touch"
          aria-label="Archive report"
          title="Archive report (E)"
          aria-keyshortcuts="e"
          triggerRef={archiveButton}
          disabled={disabled || visibility.disabled}
          requiresConfirmation={() => detail.shared}
          dialogTitle="Archive this shared report?"
          review={
            <p>
              Archiving stops sharing this report. Its public link will stop
              working.
            </p>
          }
          cancelLabel="Cancel"
          confirmLabel="Archive and stop sharing"
          onConfirm={() =>
            void visibility.change(true, { revokeShare: detail.shared })
          }
        >
          <Archive size={16} aria-hidden="true" />
        </ConfirmationButton>
      </div>
    )
  return (
    <div className={compact ? styles.compactVisibility : undefined}>
      <Button
        variant={compact ? 'ghost' : 'secondary'}
        size={compact ? 'icon-touch' : undefined}
        aria-label={hidden ? 'Move to inbox' : 'Archive report'}
        disabled={disabled || visibility.disabled || (!hidden && !!starred)}
        title={
          starred && !hidden
            ? 'Unstar this report before archiving it'
            : hidden
              ? 'Move to inbox'
              : 'Move to Archived; you can move it back to Inbox'
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
