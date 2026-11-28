import { Pencil } from 'lucide-react'
import { Tooltip } from '@base-ui/react/tooltip'
import { ButtonLinkAnchor } from '../../ui/button'
import tooltipStyles from '../../ui/info-tooltip.module.css'
import type { ShipAppearanceState } from '../../client-model/ship-appearance-types'
import { EmpireInsignia } from '../empire-insignia'
import styles from './ship-customizer.module.css'

export function EmblemControls({
  emblem,
  editHref,
  checked,
  disabled,
  onToggle,
}: {
  emblem: ShipAppearanceState['emblem']
  editHref: string
  checked: boolean
  disabled: boolean
  onToggle: () => void
}) {
  return (
    <section className={styles.emblem} aria-label="Empire emblem">
      <div className={styles.emblemHeading}>
        {emblem && (
          <EmpireInsignia
            appearance={emblem}
            size="medium"
            label="Current empire emblem"
          />
        )}
        <div>
          <div className={styles.emblemTitle}>
            <h3>Empire emblem</h3>
            <Tooltip.Root>
              <Tooltip.Trigger
                render={
                  <ButtonLinkAnchor
                    variant="ghost"
                    size="icon-touch"
                    href={editHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Edit empire emblem (opens in a new tab)"
                  />
                }
              >
                <Pencil size={16} aria-hidden="true" />
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Positioner
                  className={styles.dyeTooltipPositioner}
                  side="top"
                  sideOffset={6}
                >
                  <Tooltip.Popup role="tooltip" className={tooltipStyles.popup}>
                    Edit empire emblem
                  </Tooltip.Popup>
                </Tooltip.Positioner>
              </Tooltip.Portal>
            </Tooltip.Root>
          </div>
          {!emblem && <p>No empire emblem is currently available.</p>}
        </div>
        <button
          className={styles.emblemSwitch}
          type="button"
          role="switch"
          aria-label="Show empire emblem"
          aria-checked={checked}
          disabled={disabled}
          onClick={onToggle}
        />
      </div>
    </section>
  )
}
