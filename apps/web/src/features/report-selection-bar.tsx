import { Archive, Inbox, ListChecks, X } from 'lucide-react'
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
}: {
  visible: components['schemas']['ReportHeader4'][]
  selected: Set<string>
  select: (ids: Set<string>) => void
  archived: boolean
  disabled: boolean
  cleanup: ReturnType<typeof useReportCleanup>
  onCancel: () => void
}) {
  const eligible = visible.filter((report) => archived || !report.starred)
  const chosen = eligible.filter((report) => selected.has(report.id))
  const busy = disabled || cleanup.submitting
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
      {chosen.length > 0 && (
        <Button
          variant="secondary"
          size="compact"
          aria-label={`${label} (${chosen.length})`}
          disabled={busy || cleanup.coolingDown}
          onClick={() => void cleanup.remove(chosen, !archived)}
        >
          {archived ? (
            <Inbox size={16} aria-hidden="true" />
          ) : (
            <Archive size={16} aria-hidden="true" />
          )}
          {archived ? 'Move to inbox' : 'Archive'}
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon"
        aria-label="Cancel selection"
        title="Cancel selection"
        disabled={cleanup.submitting}
        onClick={onCancel}
      >
        <X size={16} aria-hidden="true" />
      </Button>
    </div>
  )
}
