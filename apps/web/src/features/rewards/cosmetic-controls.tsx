import type { InsigniaState, InsigniaRecipe } from '../../adapters/insignias'
import { TreatmentPreview } from './cosmetic-treatment'
import styles from './rewards.module.css'
export function CosmeticColor({
  snapshot,
  label,
  value,
  disabled,
  onChange,
}: {
  snapshot: InsigniaState
  label: string
  value: string
  disabled?: boolean
  onChange: (value: string) => void
}) {
  if (!snapshot.dyes?.length)
    return (
      <label>
        {label}
        <input
          type="color"
          aria-label={label}
          disabled={disabled}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
    )
  const dyes = snapshot.dyes,
    groups = [
      ...new Set(
        dyes.map((d) => `${d.tier} · ${d.palette_id ?? 'Individual dyes'}`),
      ),
    ]
  return (
    <label>
      {label}
      <select
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        {!value.startsWith('dye:') && (
          <option value={value}>Saved legacy color</option>
        )}
        {value.startsWith('dye:') &&
          !dyes.some((d) => `dye:${d.id}` === value) && (
            <option value={value}>Saved dye unavailable</option>
          )}
        {groups.map((group) => (
          <optgroup label={group} key={group}>
            {dyes
              .filter(
                (d) =>
                  `${d.tier} · ${d.palette_id ?? 'Individual dyes'}` === group,
              )
              .map((d) => (
                <option
                  key={d.id}
                  value={`dye:${d.id}`}
                  disabled={d.availability !== 'available'}
                >
                  {d.name}
                  {d.availability !== 'available'
                    ? ' · Locked'
                    : d.access === 'free'
                      ? ' · Free'
                      : ''}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
    </label>
  )
}
export function CosmeticTreatments({
  snapshot,
  recipe,
  busy,
  onChange,
}: {
  snapshot: InsigniaState
  recipe: InsigniaRecipe
  busy: boolean
  onChange: (value: InsigniaRecipe) => void
}) {
  if (!snapshot.treatments?.length) return null
  return (
    <div className={styles.treatmentControls}>
      {(['finish', 'effect'] as const).map((kind) => {
        const selected = snapshot.treatments?.find((t) => t.id === recipe[kind])
        return (
          <div key={kind}>
            <label>
              {kind === 'finish'
                ? 'Surface finish'
                : 'Light or interaction effect'}
              <select
                value={recipe[kind] ?? ''}
                disabled={busy}
                onChange={(e) =>
                  onChange({
                    ...recipe,
                    version: 3,
                    [kind]: e.target.value || undefined,
                  })
                }
              >
                <option value="">None · Plain</option>
                {recipe[kind] && !selected && (
                  <option value={recipe[kind]}>
                    Saved treatment unavailable
                  </option>
                )}
                {snapshot.treatments
                  ?.filter(
                    (t) => (t.family === 'finish') === (kind === 'finish'),
                  )
                  .map((t) => (
                    <option
                      key={t.id}
                      value={t.id}
                      disabled={t.availability !== 'available'}
                    >
                      {t.name}
                      {t.availability !== 'available' ? ' · Locked' : ''}
                    </option>
                  ))}
              </select>
            </label>
            {selected && (
              <TreatmentPreview
                treatment={{
                  ...selected,
                  sample_dye:
                    snapshot.dyes?.find(
                      (d) => `dye:${d.id}` === recipe.foreground,
                    )?.color ?? recipe.foreground,
                }}
                label={`${selected.name} preview`}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
