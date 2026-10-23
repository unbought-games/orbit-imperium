import { useId, useRef } from 'react'
import { Pencil } from 'lucide-react'
import type { Coordinator } from '../client-model/coordinator'
import type { BoundView } from '../client-model/commands'
import { Button } from '../ui/button'
import { Input, Field } from '../ui/form'
import { coordinates } from '../ui/format'
import { usePlanetRename } from './use-planet-rename'
import styles from './planet-rename.module.css'

export function PlanetRename({
  model,
  body,
}: {
  model: Coordinator
  body: BoundView['bodies'][number]
}) {
  const rename = usePlanetRename(model, body)
  const id = useId()
  const opener = useRef<HTMLButtonElement>(null)
  function cancel() {
    rename.cancel()
    requestAnimationFrame(() => opener.current?.focus())
  }
  return (
    <div className={styles.editor}>
      {rename.draft === null ? (
        <Button
          ref={opener}
          variant="quiet"
          onClick={rename.edit}
          aria-label={`Rename planet ${coordinates(body)}`}
        >
          <Pencil size={14} aria-hidden="true" /> Rename
        </Button>
      ) : (
        <form
          aria-label={`Rename planet ${coordinates(body)}`}
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
          <Field htmlFor={id}>Planet name</Field>
          <Input
            id={id}
            autoFocus
            value={rename.draft}
            onChange={(event) => rename.setDraft(event.target.value)}
            aria-invalid={!!rename.error}
            aria-describedby={`${id}-help ${id}-error`}
          />
          <small id={`${id}-help`}>
            Public name · 1–40 characters · Free to change anytime
          </small>
          <p id={`${id}-error`} role="alert">
            {rename.error}
          </p>
          <div className={styles.actions}>
            <Button type="submit" disabled={!rename.canSave}>
              Save name
            </Button>
            <Button type="button" variant="quiet" onClick={cancel}>
              Cancel
            </Button>
          </div>
        </form>
      )}
      <p role="status">{rename.status}</p>
    </div>
  )
}
