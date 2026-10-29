import { useId, type RefObject } from 'react'
import type { HarvestPosition } from '../client-model/galaxy-harvest'
import { Button } from '../ui/button'
import { Field, NumberInput } from '../ui/form'
import { ResourceValue } from '../ui/resource-value'
import { formatWholeNumber } from '../ui/whole-number'
import type { useGalaxyHarvest } from './use-galaxy-harvest'
import styles from './galaxy-harvest-form.module.css'

export function GalaxyHarvestForm({
  harvest,
  position,
  inputRef,
  onCustomize,
  onRecover,
}: {
  harvest: ReturnType<typeof useGalaxyHarvest>
  position: HarvestPosition
  inputRef: RefObject<HTMLInputElement | null>
  onCustomize: () => void
  onRecover: () => void
}) {
  const helpId = useId()
  const disabled = harvest.busy || harvest.paused || harvest.blockers.length > 0
  return (
    <>
      <div className={styles.debris} aria-label="Available debris">
        <ResourceValue resource="metal">
          {formatWholeNumber(position.debris?.metal ?? '0')}
        </ResourceValue>
        <ResourceValue resource="crystal">
          {formatWholeNumber(position.debris?.crystal ?? '0')}
        </ResourceValue>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void harvest.send()
        }}
      >
        <div className={styles.sendRow}>
          <Field>
            Recyclers
            <NumberInput
              ref={inputRef}
              aria-describedby={helpId}
              aria-invalid={!!harvest.invalid && !disabled}
              value={harvest.count}
              disabled={disabled}
              onChange={(event) => harvest.setEdit(event.target.value)}
            />
          </Field>
          <Button type="submit" disabled={disabled || !!harvest.invalid}>
            {harvest.busy ? 'Sending…' : 'Send'}
          </Button>
        </div>
        <div id={helpId} className={styles.help}>
          <p>
            {formatWholeNumber(harvest.available)} available ·{' '}
            {formatWholeNumber(harvest.needed)} needed to collect all debris
          </p>
          {harvest.blockers.map((reason) => (
            <p key={reason}>{reason}</p>
          ))}
          {!disabled && harvest.invalid && <p>{harvest.invalid}</p>}
        </div>
        {harvest.error && <p role="alert">{harvest.error}</p>}
        {harvest.uncertain && (
          <p role="status">
            Departure is unconfirmed. Resolve the saved command before sending
            again.
          </p>
        )}
        {harvest.uncertain && harvest.commandId && (
          <Button type="button" variant="secondary" onClick={onRecover}>
            Resolve saved command
          </Button>
        )}
        <Button
          className={styles.customize}
          type="button"
          variant="secondary"
          onClick={onCustomize}
        >
          Customize
        </Button>
      </form>
    </>
  )
}
