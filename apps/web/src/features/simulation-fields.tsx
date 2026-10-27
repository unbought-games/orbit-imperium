import { Button } from '../ui/button'
import { NumberInput } from '../ui/form'
import { label } from '../ui/format'
import { formatWholeNumber } from '../ui/whole-number'
import type { SimulationField } from './combat-simulation-model'
import styles from './combat-simulation.module.css'

export function SimulationFields({
  fields,
  edits,
  edit,
}: {
  fields: SimulationField[]
  edits: Record<string, string>
  edit: (values: Record<string, string>) => void
}) {
  return (
    <>
      {(['Technologies', 'Ships', 'Defenses'] as const).map((group) => {
        const members = fields.filter((f) =>
          group === 'Technologies'
            ? f.technology !== undefined
            : f.item?.kind === (group === 'Ships' ? 'Ship' : 'Defense'),
        )
        if (!members.length) return null
        return (
          <section
            key={group}
            aria-label={`${fields[0]?.side === 'attacker' ? 'Attacker' : 'Defender'} ${group.toLowerCase()}`}
          >
            <h3 className={styles.groupHeading}>{group}</h3>
            {members.map((field) => (
              <div key={field.key} className={styles.field}>
                <label htmlFor={`simulation-${field.key}`}>
                  {label(field.label)}
                  <small>
                    {edits[field.key] !== undefined
                      ? `Player assumption${field.value !== null ? ` · ${field.source.toLowerCase()}: ${field.value}` : ' · not observed'}`
                      : field.value === null
                        ? 'Unknown · not observed'
                        : field.source}
                  </small>
                </label>
                <div className={styles.fieldControl}>
                  {field.available !== undefined && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="small"
                      className={styles.available}
                      aria-label={`Use all ${formatWholeNumber(field.available)} available ${label(field.label)}`}
                      title={`Fill with ${formatWholeNumber(field.available)} ${label(field.label)} stationed at this origin`}
                      onClick={() => edit({ [field.key]: field.available! })}
                    >
                      {formatWholeNumber(field.available)} available
                    </Button>
                  )}
                  <NumberInput
                    id={`simulation-${field.key}`}
                    aria-label={`${field.side === 'attacker' ? 'Attacker' : 'Defender'} ${label(field.label)}`}
                    value={edits[field.key] ?? field.value ?? ''}
                    placeholder="Unknown"
                    onChange={(event) =>
                      edit({ [field.key]: event.target.value })
                    }
                  />
                </div>
              </div>
            ))}
          </section>
        )
      })}
    </>
  )
}
