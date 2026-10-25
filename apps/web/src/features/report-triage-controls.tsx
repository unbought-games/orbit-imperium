import { useState } from 'react'
import type { useReportCleanup } from './use-report-cleanup'
import type { components } from '../contracts'
import { Button } from '../ui/button'
import { Field, Input, Select } from '../ui/form'
import {
  ageCutoff,
  olderUnstarred,
  type ReportSort,
  type ReportFilter,
} from './report-triage'
import styles from './reports.module.css'

type Header = components['schemas']['ReportHeader4']
export type TriageOptions = {
  sort: ReportSort
  ascending: boolean
  filter: ReportFilter
  knownOnly: boolean
}
export const defaultTriage: TriageOptions = {
  sort: 'newest',
  ascending: false,
  filter: 'all',
  knownOnly: false,
}
export function ReportTriageControls({
  cleanup,
  reports,
  visible,
  options,
  change,
  selected,
  select,
  disabled,
  now,
}: {
  cleanup: ReturnType<typeof useReportCleanup>
  reports: Header[]
  visible: Header[]
  options: TriageOptions
  change: (options: TriageOptions) => void
  selected: Set<string>
  select: (ids: Set<string>) => void
  disabled: boolean
  now: number
}) {
  const [hours, setHours] = useState('24')
  const { submitting, error, remove } = cleanup
  const eligible = visible.filter((r) => !r.starred)
  const chosen = eligible.filter((r) => selected.has(r.id))
  const old = olderUnstarred(reports, hours, now)
  const busy = disabled || submitting
  return (
    <div className={styles.triage}>
      <div className={styles.controls}>
        <Field>
          Sort by
          <Select
            value={options.sort}
            disabled={busy}
            onChange={(e) =>
              change({ ...options, sort: e.target.value as ReportSort })
            }
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="metal">Metal</option>
            <option value="crystal">Crystal</option>
            <option value="deuterium">Deuterium</option>
            <option value="total">Total resources</option>
            <option value="fleet">Fleet investment</option>
            <option value="defenses">Defense investment</option>
          </Select>
        </Field>
        <Field>
          Order
          <Select
            value={options.ascending ? 'ascending' : 'descending'}
            disabled={busy || ['newest', 'oldest'].includes(options.sort)}
            onChange={(e) =>
              change({ ...options, ascending: e.target.value === 'ascending' })
            }
          >
            <option value="descending">Highest first</option>
            <option value="ascending">Lowest first</option>
          </Select>
        </Field>
        <Field>
          Show
          <Select
            value={options.filter}
            disabled={busy}
            onChange={(e) =>
              change({ ...options, filter: e.target.value as ReportFilter })
            }
          >
            <option value="all">All reports</option>
            <option value="espionage">Espionage</option>
            <option value="starred">Starred</option>
            <option value="unread">Unread</option>
          </Select>
        </Field>
        <label>
          <input
            type="checkbox"
            checked={options.knownOnly}
            disabled={busy}
            onChange={(e) =>
              change({ ...options, knownOnly: e.target.checked })
            }
          />{' '}
          Known sort values only
        </label>
      </div>
      <p>
        Resource and investment sorting uses espionage observations. Investment
        is total metal, crystal and deuterium at current rules costs, not combat
        power. Unknown values sort last.
      </p>
      <div className={styles.controls}>
        <Button
          variant="secondary"
          disabled={busy || !eligible.length}
          onClick={() => select(new Set(eligible.map((r) => r.id)))}
        >
          Select all matching ({eligible.length})
        </Button>
        <Button
          variant="secondary"
          disabled={busy || !selected.size}
          onClick={() => select(new Set())}
        >
          Clear selection
        </Button>
        <Button
          variant="secondary"
          disabled={busy || !chosen.length}
          onClick={() => void remove(chosen)}
        >
          Delete selected ({chosen.length})
        </Button>
      </div>
      <div className={styles.controls}>
        <Field>
          Delete reports older than (hours)
          <Input
            type="number"
            min="0.01"
            step="any"
            value={hours}
            disabled={busy}
            onChange={(e) => setHours(e.target.value)}
          />
        </Field>
        <Button
          variant="secondary"
          disabled={busy || !old.length || ageCutoff(hours, now) === null}
          onClick={() => void remove(old)}
        >
          Delete older reports ({old.length})
        </Button>
      </div>
      <p>
        Age cleanup covers the entire inbox, regardless of filters. Starred
        reports are always protected.
      </p>
      {error && <p role="alert">{error}</p>}
      {submitting && <p role="status">Submitting cleanup…</p>}
    </div>
  )
}
