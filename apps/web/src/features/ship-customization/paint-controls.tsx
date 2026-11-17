import { Check } from 'lucide-react'
import type {
  ShipDye,
  ShipPaintRecipe,
  ShipSkin,
} from '../../client-model/ship-appearance-types'
import { Field, Select } from '../../ui/form'
import styles from './ship-customizer.module.css'

function DyePicker({
  label,
  value,
  dyes,
  onChange,
  disabled,
}: {
  label: string
  value: string
  dyes: ShipDye[]
  onChange: (id: string) => void
  disabled: boolean
}) {
  const selected = dyes.find((dye) => dye.id === value)
  return (
    <fieldset className={styles.fieldset} disabled={disabled}>
      <legend>
        {label} <span>{selected?.name ?? 'Unavailable dye'}</span>
      </legend>
      <div className={styles.dyes}>
        {dyes.map((dye) => (
          <button
            key={dye.id}
            type="button"
            className={styles.dye}
            aria-label={`${label}: ${dye.name}${dye.availability !== 'available' ? ` (${dye.availability})` : ''}`}
            title={`${dye.name}${dye.availability !== 'available' ? ` · ${dye.availability}` : ''}`}
            aria-pressed={value === dye.id}
            disabled={dye.availability !== 'available'}
            onClick={() => onChange(dye.id)}
          >
            <span
              className={styles.color}
              style={{ backgroundColor: dye.color }}
              aria-hidden="true"
            />
            <span>{dye.name}</span>
            {value === dye.id && <Check size={16} aria-hidden="true" />}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

export function PaintControls({
  recipe,
  skins,
  dyes,
  disabled,
  onChange,
}: {
  recipe: ShipPaintRecipe
  skins: ShipSkin[]
  dyes: ShipDye[]
  disabled: boolean
  onChange: (recipe: ShipPaintRecipe) => void
}) {
  const selectedSkin = skins.find(
    (skin) =>
      skin.id === recipe.skin_id &&
      skin.package_revision === recipe.package_revision,
  )
  return (
    <>
      <Field>
        Ship finish
        <Select
          value={selectedSkin?.id ?? ''}
          disabled={disabled}
          onChange={(event) => {
            const skin = skins.find((item) => item.id === event.target.value)
            if (skin)
              onChange({
                ...recipe,
                skin_id: skin.id,
                package_revision: skin.package_revision,
              })
          }}
        >
          {!selectedSkin && <option value="">Unavailable finish</option>}
          {skins.map((skin) => (
            <option key={skin.id} value={skin.id} disabled={!skin.available}>
              {skin.name}
              {!skin.available ? ' · unavailable' : ''}
            </option>
          ))}
        </Select>
      </Field>
      <DyePicker
        label="Primary"
        value={recipe.primary}
        dyes={dyes}
        disabled={disabled}
        onChange={(primary) => onChange({ ...recipe, primary })}
      />
      <DyePicker
        label="Accent"
        value={recipe.accent}
        dyes={dyes}
        disabled={disabled}
        onChange={(accent) => onChange({ ...recipe, accent })}
      />
    </>
  )
}
