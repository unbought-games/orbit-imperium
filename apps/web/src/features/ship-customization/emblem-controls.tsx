import type {
  ShipAppearanceState,
  ShipPaintRecipe,
} from '../../client-model/ship-appearance-types'
import { EmpireInsignia } from '../empire-insignia'
import { Field, Select } from '../../ui/form'
import styles from './ship-customizer.module.css'

export function EmblemControls({
  emblem,
  value,
  disabled,
  onChange,
}: {
  emblem: ShipAppearanceState['emblem']
  value: ShipPaintRecipe['emblem']
  disabled: boolean
  onChange: (value: ShipPaintRecipe['emblem']) => void
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
          <h3>Empire emblem</h3>
          <p>
            {emblem
              ? 'Follows this empire’s emblem automatically.'
              : 'No empire emblem is currently available.'}
          </p>
        </div>
      </div>
      <div className={styles.emblemOptions}>
        <Field>
          Appearance
          <Select
            aria-label="Appearance"
            value={value.treatment}
            disabled={disabled}
            onChange={(event) =>
              onChange({
                ...value,
                treatment: event.target.value as typeof value.treatment,
              })
            }
          >
            <option value="none">None</option>
            <option value="full">Full emblem</option>
            <option value="layers">Emblem layers</option>
          </Select>
        </Field>
        <Field>
          Placement
          <Select
            aria-label="Placement"
            value={value.placement}
            disabled={disabled || value.treatment === 'none'}
            onChange={(event) =>
              onChange({
                ...value,
                placement: event.target.value as typeof value.placement,
              })
            }
          >
            <option value="near-wing">Near wing</option>
            <option value="paired">Paired wings</option>
          </Select>
        </Field>
      </div>
    </section>
  )
}
