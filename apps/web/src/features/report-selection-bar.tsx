import { Archive, Inbox, ListChecks, MailOpen, X } from 'lucide-react'
import { Button } from '../ui/button'
import type { components } from '../contracts'
import type { useReportCleanup } from './use-report-cleanup'
import styles from './report-controls.module.css'

export function ReportSelectionBar({
  visible,
  selected,
  select,
  archived,
  disabled,
  cleanup,
  onCancel,
  onMarkRead,
  markingRead = false,
}: {
  visible: components['schemas']['ReportHeader4'][]
  selected: Set<string>
  select: (ids: Set<string>) => void
  archived: boolean
  disabled: boolean
  cleanup: ReturnType<typeof useReportCleanup>
  markingRead?: boolean
  onMarkRead?: (ids: string[]) => void
  onCancel: () => void
}) {
  const eligible = visible.filter(
    (report) => onMarkRead || archived || !report.starred,
  )
  const chosen = eligible.filter((report) => selected.has(report.id))
  const archivable = chosen.filter((report) => archived || !report.starred)
  const unread = chosen.filter((report) => !report.read)
  const busy = disabled || cleanup.submitting || markingRead
  const all = eligible.length > 0 && chosen.length === eligible.length
  const label = archived ? 'Move to inbox' : 'Archive selected'
  return (
    <div
      className={styles.selectionBar}
      role="group"
      aria-label="Report selection"
    >
      <Button
        variant="ghost"
        size="icon"
        aria-label={
          all ? 'Clear selection' : `Select all matching (${eligible.length})`
        }
        title={
          all
            ? 'Clear selection'
            : `Select all ${eligible.length} matching reports`
        }
        aria-pressed={all}
        disabled={busy || !eligible.length}
        onClick={() =>
          select(new Set(all ? [] : eligible.map((report) => report.id)))
        }
      >
        <ListChecks size={16} aria-hidden="true" />
      </Button>
      <span aria-live="polite">{chosen.length} selected</span>
      {onMarkRead && chosen.length > 0 && (
        <Button
          variant="secondary"
          size="compact"
          disabled={busy || cleanup.coolingDown || !unread.length}
          onClick={() => onMarkRead(unread.map((report) => report.id))}
        >
          <MailOpen size={16} aria-hidden="true" />
          Mark as read
        </Button>
      )}
      {chosen.length > 0 && (
        <Button
          variant="secondary"
          size="compact"
          aria-label={`${label} (${archivable.length})`}
          disabled={busy || cleanup.coolingDown || !archivable.length}
          onClick={() => void cleanup.remove(archivable, !archived)}
        >
          {archived ? (
            <Inbox size={16} aria-hidden="true" />
          ) : (
            <Archive size={16} aria-hidden="true" />
          )}
          {archived ? 'Move to inbox' : 'Archive'}
        </Button>
      )}
      {(!onMarkRead || chosen.length > 0) && (
        <Button
          variant="ghost"
          size="icon"
          aria-label="Cancel selection"
          title="Cancel selection"
          disabled={cleanup.submitting || markingRead}
          onClick={onCancel}
        >
          <X size={16} aria-hidden="true" />
        </Button>
      )}
    </div>
  )
}
