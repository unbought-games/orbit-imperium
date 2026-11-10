import { useId, type ReactNode } from 'react'
import { Button } from '../../ui/button'
import { useAllianceDraft } from './drafts'
import styles from './settings.module.css'

export function SettingsSection({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  const id = useId()
  return (
    <section className={styles.section} aria-labelledby={id}>
      <header className={styles.sectionHeading}>
        <h3 id={id}>{title}</h3>
        {description && <p>{description}</p>}
      </header>
      <div className={styles.fields}>{children}</div>
    </section>
  )
}

export function SettingsForm({
  children,
  draftKey,
  label,
  busy,
  onSubmit,
}: {
  children: ReactNode
  draftKey: string
  label: string
  busy: boolean
  onSubmit: (data: FormData) => Promise<boolean>
}) {
  const draft = useAllianceDraft(draftKey)
  return (
    <form
      ref={draft.form}
      onChange={draft.onChange}
      aria-label={label}
      onSubmit={(event) => {
        event.preventDefault()
        void onSubmit(new FormData(event.currentTarget)).then((ok) => {
          if (ok) draft.clear()
        })
      }}
    >
      <fieldset className={styles.formFields} disabled={busy}>
        {children}
        <div className={styles.save}>
          <Button type="submit" size="small">
            {label}
          </Button>
        </div>
      </fieldset>
    </form>
  )
}
