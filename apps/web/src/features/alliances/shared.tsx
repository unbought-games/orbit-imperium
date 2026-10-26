import { useAllianceDraft } from './drafts'
import { useMemo, useState, type ReactNode } from 'react'
import type { components } from '../../contracts'
import type { AllianceAction } from '../../client-model/alliances'
import { Button } from '../../ui/button'
import { allianceMarkdown } from './markdown'
import styles from './alliances.module.css'
export type Run = (action: AllianceAction) => Promise<boolean>
export function Markdown({ text }: { text: string }) {
  // Game clock updates must not replace unchanged notice DOM: that disrupts
  // browser scrolling, text selection and focused links while reading.
  const markup = useMemo(() => ({ __html: allianceMarkdown(text) }), [text])
  return <div className={styles.markdown} dangerouslySetInnerHTML={markup} />
}
export function Summary({
  summary,
}: {
  summary: components['schemas']['AllianceSummary']
}) {
  const rank = summary.ranking
  return (
    <header className={styles.hero}>
      <span className={styles.tag}>[{summary.tag}]</span>
      <h2>{summary.name}</h2>
      <div className={styles.stats}>
        <span>{summary.member_count.toLocaleString()} members</span>
        <span>
          {summary.recruitment === 'Application'
            ? 'Accepting applications'
            : summary.recruitment === 'Open'
              ? 'Open recruitment'
              : 'Recruitment closed'}
        </span>
        {rank && (
          <>
            <span>
              Rank <strong>#{rank.rank.toLocaleString()}</strong>
            </span>
            <span>
              <strong>{BigInt(rank.points).toLocaleString()}</strong> points
            </span>
            <span>
              {BigInt(rank.average_points).toLocaleString()} average points
            </span>
          </>
        )}
      </div>
    </header>
  )
}
export function ActionForm({
  children,
  onSubmit,
  draftKey,
  label,
  busy = false,
}: {
  children: ReactNode
  draftKey: string
  onSubmit: (data: FormData) => Promise<boolean>
  label: string
  busy?: boolean
}) {
  const draft = useAllianceDraft(draftKey)
  return (
    <form
      ref={draft.form}
      onChange={draft.onChange}
      className={styles.form}
      onSubmit={(e) => {
        e.preventDefault()
        const form = e.currentTarget
        void onSubmit(new FormData(form)).then((ok) => {
          if (ok) {
            draft.clear()
            if (form.isConnected) form.reset()
          }
        })
      }}
    >
      <fieldset disabled={busy}>
        {children}
        <Button type="submit">{label}</Button>
      </fieldset>
    </form>
  )
}
export function ConfirmAction({
  label,
  description,
  onConfirm,
  disabled = false,
}: {
  label: string
  description: string
  onConfirm: () => Promise<boolean>
  disabled?: boolean
}) {
  const [review, setReview] = useState(false)
  return review ? (
    <div className={styles.review} role="group" aria-label={`Review ${label}`}>
      <p>{description}</p>
      <Button
        variant="destructive"
        disabled={disabled}
        onClick={() => {
          void onConfirm().then((ok) => {
            if (ok) setReview(false)
          })
        }}
      >
        Confirm {label.toLowerCase()}
      </Button>
      <Button
        variant="secondary"
        disabled={disabled}
        onClick={() => setReview(false)}
      >
        Cancel
      </Button>
    </div>
  ) : (
    <Button
      variant="secondary"
      disabled={disabled}
      onClick={() => setReview(true)}
    >
      {label}
    </Button>
  )
}
export const value = (data: FormData, key: string) =>
  String(data.get(key) ?? '')
