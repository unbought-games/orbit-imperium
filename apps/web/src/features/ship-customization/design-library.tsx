import type { ShipDesign } from '../../client-model/ship-appearance-types'
import { Field, Select } from '../../ui/form'

export function DesignLibrary({
  designs,
  selected,
  disabled,
  onChoose,
  onNew,
}: {
  designs: ShipDesign[]
  selected: ShipDesign
  disabled: boolean
  onChoose: (design: ShipDesign) => void
  onNew: () => void
}) {
  const key = `${selected.id}:${selected.revision}`
  const inLibrary = designs.some(
    (design) => `${design.id}:${design.revision}` === key,
  )
  return (
    <Field>
      Saved designs
      <Select
        aria-label="Saved designs"
        value={selected.id ? key : ''}
        disabled={disabled}
        onChange={(event) => {
          if (!event.target.value) onNew()
          else {
            const design = designs.find(
              (item) => `${item.id}:${item.revision}` === event.target.value,
            )
            if (design) onChoose(design)
          }
        }}
      >
        <option value="">New design</option>
        {selected.id && !inLibrary && (
          <option value={key}>
            {selected.name} · version {selected.revision} (editing)
          </option>
        )}
        {designs.map((design) => (
          <option
            key={`${design.id}:${design.revision}`}
            value={`${design.id}:${design.revision}`}
          >
            {design.name} · version {design.revision}
          </option>
        ))}
      </Select>
    </Field>
  )
}
