import { useEffect, useId, useRef } from 'react'
import { Check, Pencil, X } from 'lucide-react'
import type { Coordinator } from '../client-model/coordinator'
import type { BoundView } from '../client-model/commands'
import { Button } from '../ui/button'
import { Input } from '../ui/form'
import { bodyName, coordinates } from '../ui/format'
import { useBodyRename } from './use-body-rename'
import styles from './body-rename.module.css'

export function BodyRename({
  model,
  body,
}: {
  model: Coordinator
  body: BoundView['bodies'][number]
}) {
  const rename = useBodyRename(model, body)
  const action = `Rename ${body.kind.toLowerCase()}`
  const actionLabel = `${action} ${coordinates(body)}`
  const id = useId()
  const opener = useRef<HTMLButtonElement>(null)
  const editing = rename.draft !== null && !rename.saved
  useEffect(() => {
    if (rename.saved) opener.current?.focus()
  }, [rename.saved])
  function cancel() {
    rename.cancel()
    requestAnimationFrame(() => opener.current?.focus())
  }
  return (
    <div className={styles.editor}>
      {!editing ? (
        <div className={styles.nameRow}>
          <h3>{bodyName(body)}</h3>
          <Button
            ref={opener}
            type="button"
            variant="ghost"
            size="icon-touch"
            onClick={rename.edit}
            aria-label={actionLabel}
            title={action}
          >
            <Pencil size={16} aria-hidden="true" />
          </Button>
        </div>
      ) : (
        <form
          aria-label={actionLabel}
          onSubmit={(event) => {
            event.preventDefault()
            if (rename.canSave) void rename.save()
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              cancel()
            }
          }}
        >
          <div className={styles.nameRow}>
            <Input
              id={id}
              aria-label={`${body.kind} name`}
              autoFocus
              onFocus={(event) => event.currentTarget.select()}
              value={rename.draft ?? ''}
              onChange={(event) => rename.setDraft(event.target.value)}
              aria-invalid={!!rename.error}
              aria-describedby={`${id}-help ${id}-error`}
            />
            <Button
              type="submit"
              variant="ghost"
              size="icon-touch"
              disabled={!rename.canSave}
              aria-label="Save name"
              title="Save name"
            >
              <Check size={16} aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-touch"
              onClick={cancel}
              aria-label="Cancel"
              title="Cancel"
            >
              <X size={16} aria-hidden="true" />
            </Button>
          </div>
          <small id={`${id}-help`} className={styles.srOnly}>
            Public name · 1–40 characters · Free to change anytime
          </small>
          <p id={`${id}-error`} role="alert">
            {rename.error}
          </p>
        </form>
      )}
      <p role="status">{rename.status}</p>
    </div>
  )
}
