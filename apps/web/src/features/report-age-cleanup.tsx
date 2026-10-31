import { Archive } from 'lucide-react'
import type { components } from '../contracts'
import { Button } from '../ui/button'
import { Field, Input, Select } from '../ui/form'
import { ageCutoff, olderUnstarred } from './report-triage'
import type { useReportCleanup } from './use-report-cleanup'
import styles from './report-controls.module.css'

export function ReportAgeCleanup({
  reports,
  cleanup,
  now,
  disabled,
  error,
  age,
  change,
}: {
  reports: components['schemas']['ReportHeader4'][]
  cleanup: ReturnType<typeof useReportCleanup>
  now: number
  disabled: boolean
  error: string
  age: { preset: string; customHours: string }
  change: (age: { preset: string; customHours: string }) => void
}) {
  const { preset, customHours } = age
  const hours = preset === 'custom' ? customHours : preset
  const old = olderUnstarred(reports, hours, now)
  const busy = disabled || cleanup.submitting
  return (
    <div className={styles.fields}>
      <Field>
        Older than
        <Select
          value={preset}
          onChange={(event) => change({ ...age, preset: event.target.value })}
          disabled={busy}
        >
          <option value="24">24 hours</option>
          <option value="168">7 days</option>
          <option value="720">30 days</option>
          <option value="custom">Custom</option>
        </Select>
      </Field>
      {preset === 'custom' && (
        <Field>
          Hours
          <Input
            type="number"
            min="0.01"
            step="any"
            value={customHours}
            onChange={(event) =>
              change({ ...age, customHours: event.target.value })
            }
            disabled={busy}
          />
        </Field>
      )}
      {error && <p role="alert">{error}</p>}
      <p className={styles.scope}>Entire Inbox · Starred reports stay.</p>
      <Button
        size="compact"
        disabled={
          busy ||
          cleanup.coolingDown ||
          !old.length ||
          ageCutoff(hours, now) === null
        }
        onClick={() => void cleanup.remove(old)}
      >
        <Archive size={16} aria-hidden="true" />
        Archive {old.length} {old.length === 1 ? 'report' : 'reports'}
      </Button>
    </div>
  )
}
