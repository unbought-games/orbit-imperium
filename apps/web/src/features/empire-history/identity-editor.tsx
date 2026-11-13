import { useState, type ReactNode } from 'react'
import type {
  EmpireProfile,
  ProfileAction,
} from '../../adapters/empire-history'
import {
  defaultIdentity,
  defaultTitle,
  identityError,
  titleAvailability,
} from '../../client-model/empire-identity'
import { universeSlug } from '../../client-model/universe-name'
import { Button } from '../../ui/button'
import { Field, Form, Input, Select } from '../../ui/form'
import styles from './history.module.css'

export function IdentityEditor({
  profile,
  busy,
  save,
  cancel,
  title: heading = 'Edit empire identity',
  autoFocus = true,
  related,
  appearance = 'panel',
}: {
  profile: EmpireProfile
  busy: boolean
  save: (profile: EmpireProfile, action: ProfileAction) => Promise<boolean>
  cancel?: () => void
  title?: string | null
  autoFocus?: boolean
  related?: ReactNode
  appearance?: 'panel' | 'plain'
}) {
  const [draft, setDraft] = useState(() => ({
    ...(profile.identity ?? defaultIdentity),
  }))
  const [revision, setRevision] = useState(profile.revision)
  const [savedTitle, setSavedTitle] = useState(
    profile.identity?.title_id ?? 'commander',
  )
  const choice = profile.title_choices?.find(
    (c) => c.title.id === draft.title_id,
  )
  const title =
    choice?.availability === 'available' ? choice.title : defaultTitle
  const error = identityError(draft)
  return (
    <section
      className={`${styles.identityEditor} ${appearance === 'plain' ? styles.identityPlain : ''}`}
      aria-label="Edit empire identity"
    >
      <Form
        onSubmit={async (event) => {
          event.preventDefault()
          if (
            !error &&
            (await save(
              { ...profile, revision },
              { type: 'Identity', identity: draft },
            ))
          )
            cancel?.()
        }}
      >
        {heading && <h2>{heading}</h2>}
        <p className={styles.hint}>
          Make this empire yours. Titles unlock for your account; each empire
          chooses its own.
        </p>
        <Field>
          Empire name
          <Input
            autoFocus={autoFocus}
            value={draft.name}
            placeholder="Your empire’s name"
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          />
          <small>{Array.from(draft.name).length} / 60 characters</small>
        </Field>
        <Field>
          Tagline
          <Input
            value={draft.tagline}
            placeholder="An empire among the stars."
            onChange={(e) =>
              setDraft((d) => ({ ...d, tagline: e.target.value }))
            }
          />
          <small>{Array.from(draft.tagline).length} / 160 characters</small>
        </Field>
        <Field>
          Title
          <Select
            aria-label="Title"
            value={draft.title_id}
            onChange={(e) =>
              setDraft((d) => ({ ...d, title_id: e.target.value }))
            }
          >
            {!profile.title_choices?.some(
              (c) => c.title.id === draft.title_id,
            ) && (
              <option value={draft.title_id}>
                Saved title — not installed
              </option>
            )}
            {profile.title_choices?.map((c) => (
              <option
                key={c.title.id}
                value={c.title.id}
                disabled={
                  c.availability !== 'available' && c.title.id !== savedTitle
                }
              >
                {c.title.label}
                {c.availability !== 'available'
                  ? ` — ${titleAvailability(c.availability)}`
                  : ''}
              </option>
            ))}
          </Select>
        </Field>
        {choice?.availability !== 'available' && (
          <p className={styles.hint} role="status">
            {choice
              ? titleAvailability(choice.availability)
              : 'This title is not installed on this server'}
            . Your selection stays saved; Commander is displayed until it
            becomes available.
          </p>
        )}
        {error && <p role="alert">{error}</p>}
        {profile.revision !== revision && (
          <div role="status">
            <p>
              The saved profile changed. Review your draft before applying it to
              the refreshed version.
            </p>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setRevision(profile.revision)
                setSavedTitle(profile.identity?.title_id ?? 'commander')
              }}
            >
              Use refreshed version
            </Button>
          </div>
        )}
        <div className={styles.actions}>
          <Button type="submit" disabled={busy || !!error}>
            {busy ? 'Saving…' : 'Save identity'}
          </Button>
          {cancel && (
            <Button
              type="button"
              variant="ghost"
              onClick={cancel}
              disabled={busy}
            >
              Cancel
            </Button>
          )}
          {related !== undefined ? (
            related
          ) : (
            <a
              href={`/u/${universeSlug(profile.universe_name)}/settings/identity`}
            >
              Edit insignia in Settings
            </a>
          )}
        </div>
      </Form>
      <aside className={styles.identityPreview} aria-label="Identity preview">
        <p className={styles.eyebrow}>Empire dossier · Preview</p>
        <h2>{draft.name.trim() || profile.username}</h2>
        <p>
          {title.label} {profile.username}
        </p>
        <p className={styles.lede}>
          {draft.tagline.trim() || 'An empire among the stars.'}
        </p>
        <p className={styles.hint}>
          “Your research is complete, {title.address}.”
        </p>
      </aside>
    </section>
  )
}
