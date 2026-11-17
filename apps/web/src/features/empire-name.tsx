import { useId, useRef, useState, type RefObject } from 'react'
import { Pencil } from 'lucide-react'
import type { EmpireProfile, ProfileAction } from '../adapters/empire-history'
import { defaultIdentity, identityError } from '../client-model/empire-identity'
import { useArchive } from '../client-model/use-empire-history'
import { useIdentityTitle } from '../client-model/use-identity-title'
import {
  usePlayerDisplay,
  useRefreshPlayerProfiles,
} from '../shell/player-profiles-context'
import { ActionPopover } from '../ui/action-popover'
import { Button } from '../ui/button'
import { Field, Form, Input } from '../ui/form'
import { LoadingRegion } from '../ui/loading-region'
import styles from './empire-name.module.css'

function NameForm({
  profile,
  busy,
  save,
  close,
  inputRef,
}: {
  profile: EmpireProfile
  busy: boolean
  save: (profile: EmpireProfile, action: ProfileAction) => Promise<boolean>
  close: () => void
  inputRef: RefObject<HTMLInputElement | null>
}) {
  const [name, setName] = useState(profile.identity?.name ?? '')
  const [revision, setRevision] = useState(profile.revision)
  const identity = { ...(profile.identity ?? defaultIdentity), name }
  const error = identityError(identity)
  const id = useId()
  return (
    <Form
      onSubmit={async (event) => {
        event.preventDefault()
        if (
          !busy &&
          !error &&
          (await save({ ...profile, revision }, { type: 'Identity', identity }))
        )
          close()
      }}
    >
      <Field>
        <Input
          aria-label="Empire name"
          ref={inputRef}
          value={name}
          placeholder="Your empire’s name"
          onChange={(event) => setName(event.target.value)}
          aria-invalid={!!error}
          aria-describedby={`${id}-hint${error ? ` ${id}-error` : ''}`}
        />
        <small id={`${id}-hint`}>
          {Array.from(name).length} / 60 characters · Leave blank to use Empire.
        </small>
      </Field>
      {error && (
        <p id={`${id}-error`} role="alert">
          {error}
        </p>
      )}
      {profile.revision !== revision && (
        <div role="status">
          <p>
            The saved profile changed. Review your name before applying it to
            the refreshed version.
          </p>
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => setRevision(profile.revision)}
          >
            Use refreshed version
          </Button>
        </div>
      )}
      <div className={styles.actions}>
        <Button type="button" variant="ghost" disabled={busy} onClick={close}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy || !!error}>
          {busy ? 'Saving…' : 'Save name'}
        </Button>
      </div>
    </Form>
  )
}

function NameEditor({
  player,
  close,
  inputRef,
}: {
  player: string
  close: () => void
  inputRef: RefObject<HTMLInputElement | null>
}) {
  const {
    data: profile,
    loading,
    busy,
    error,
    retry,
    save,
  } = useArchive<EmpireProfile>(
    'EmpireProfile',
    `/api/v4/empire-profiles/${player}?library=false`,
  )
  const refreshProfiles = useRefreshPlayerProfiles()
  return (
    <>
      {error && (
        <div role="alert">
          {error}{' '}
          <Button
            type="button"
            variant="secondary"
            disabled={busy || loading}
            onClick={retry}
          >
            Refresh
          </Button>
        </div>
      )}
      <LoadingRegion
        initialFocusRef={inputRef}
        className={styles.editorLoading}
        loading={loading && !profile}
        label="Loading empire identity…"
      >
        {profile &&
          (profile.owner && !profile.closed && !profile.removed ? (
            <NameForm
              inputRef={inputRef}
              profile={profile}
              busy={busy || loading}
              save={async (current, action) => {
                const saved = await save(current, action)
                if (saved) refreshProfiles()
                return saved
              }}
              close={close}
            />
          ) : (
            <p>Identity editing is unavailable for this empire.</p>
          ))}
      </LoadingRegion>
    </>
  )
}

export function EmpireName({ player }: { player: string }) {
  const profile = usePlayerDisplay(player)
  const title = useIdentityTitle(profile?.title)
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLButtonElement>(null)
  const input = useRef<HTMLInputElement>(null)
  return (
    <div className={styles.name}>
      <h2>{profile?.identity?.name.trim() || 'Empire'}</h2>
      <Button
        ref={anchor}
        type="button"
        variant="ghost"
        size="icon-touch"
        className={styles.edit}
        aria-label="Rename empire"
        title="Rename empire"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Pencil className={styles.pencil} size={16} aria-hidden="true" />
      </Button>
      <ActionPopover
        open={open}
        onOpenChange={setOpen}
        anchorRef={anchor}
        initialFocusRef={input}
        title={`What should we call our empire, ${title.address}?`}
      >
        {open && (
          <NameEditor
            inputRef={input}
            player={player}
            close={() => setOpen(false)}
          />
        )}
      </ActionPopover>
    </div>
  )
}
