import { Copy, MoreHorizontal } from 'lucide-react'
import type { ShipDesign } from '../../client-model/ship-appearance-types'
import { AnchoredPopover } from '../../ui/anchored-popover'
import { Button } from '../../ui/button'
import { Field, Input } from '../../ui/form'
import { DesignLibrary } from './design-library'
import { targetLabel } from './model'
import styles from './ship-customizer.module.css'

export function DesignOptions({
  designs,
  draft,
  disabled,
  onChoose,
  onNameChange,
  onReset,
}: {
  designs: ShipDesign[]
  draft: ShipDesign
  disabled: boolean
  onChoose: (design: ShipDesign) => void
  onNameChange: (name: string) => void
  onReset?: () => void
}) {
  return (
    <AnchoredPopover.Root>
      <AnchoredPopover.Trigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-touch"
            aria-label="Design options"
            title="Design options"
          />
        }
      >
        <MoreHorizontal size={16} aria-hidden="true" />
      </AnchoredPopover.Trigger>
      <AnchoredPopover.Content
        className={styles.designOptions}
        positionerProps={{
          align: 'end',
          side: 'bottom',
          className: styles.designOptionsPositioner,
        }}
      >
        <AnchoredPopover.Title className={styles.optionsTitle}>
          Design options
        </AnchoredPopover.Title>
        <DesignLibrary
          designs={designs}
          selected={draft}
          disabled={disabled}
          onChoose={onChoose}
          onNew={() =>
            onChoose({
              ...draft,
              id: '',
              revision: 0,
              name: `${targetLabel(draft.target)} design`,
            })
          }
        />
        <div className={styles.nameRow}>
          <Field>
            Design name
            <Input
              value={draft.name}
              disabled={disabled}
              maxLength={40}
              onChange={(event) => onNameChange(event.target.value)}
            />
          </Field>
          <Button
            type="button"
            variant="ghost"
            size="icon-touch"
            title="Make a copy"
            aria-label="Make a copy of this design"
            disabled={disabled}
            onClick={() =>
              onChoose({
                ...draft,
                id: '',
                revision: 0,
                name: `${draft.name} copy`.slice(0, 40),
              })
            }
          >
            <Copy size={16} aria-hidden="true" />
          </Button>
        </div>
        {onReset && (
          <AnchoredPopover.Close
            render={
              <Button
                type="button"
                variant="ghost"
                disabled={disabled}
                onClick={onReset}
              />
            }
          >
            Use standard appearance
          </AnchoredPopover.Close>
        )}
      </AnchoredPopover.Content>
    </AnchoredPopover.Root>
  )
}
