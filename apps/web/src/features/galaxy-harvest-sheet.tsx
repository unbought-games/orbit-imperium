import { useId, type RefObject } from 'react'
import type { Coordinator } from '../client-model/coordinator'
import type { HarvestPosition } from '../client-model/galaxy-harvest'
import { ActionSheet } from '../ui/action-sheet'
import { Button } from '../ui/button'
import { Field, NumberInput } from '../ui/form'
import { ResourceValue } from '../ui/resource-value'
import { formatWholeNumber } from '../ui/whole-number'
import { useGalaxyHarvest } from './use-galaxy-harvest'
import styles from './galaxy-harvest-sheet.module.css'

export function GalaxyHarvestSheet({
  model,
  origin,
  position,
  open,
  onClose,
  onCustomize,
  returnFocusRef,
}: {
  model: Coordinator
  returnFocusRef: RefObject<HTMLElement | null>
  origin: string
  position: HarvestPosition
  open: boolean
  onClose: () => void
  onCustomize: () => void
}) {
  const harvest = useGalaxyHarvest(model, origin, position, open, onClose)
  const helpId = useId()
  const { galaxy, system, position: slot } = position.coordinates
  const disabled = harvest.busy || harvest.blockers.length > 0
  return (
    <ActionSheet
      returnFocusRef={returnFocusRef}
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      title="Harvest mission"
      description={`Debris at [${galaxy}:${system}:${slot}]`}
    >
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
          <Button
            type="button"
            variant="secondary"
            onClick={() => void model.recover(harvest.commandId!)}
          >
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
    </ActionSheet>
  )
}
