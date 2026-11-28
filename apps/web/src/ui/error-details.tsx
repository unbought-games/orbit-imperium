import styles from './error-details.module.css'
import { Textarea } from './form'

/** The caller supplies a sanitized report, separate from the player message. */
export function ErrorDetails({ report }: { report: string }) {
  return (
    <details className={styles.details}>
      <summary>Details</summary>
      <Textarea
        aria-label="Error report"
        readOnly
        value={report}
        rows={8}
        onFocus={(event) => event.currentTarget.select()}
      />
    </details>
  )
}
