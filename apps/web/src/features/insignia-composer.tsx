import { CosmeticColor, CosmeticTreatments } from './rewards/cosmetic-controls'
import type { InsigniaRecipe, InsigniaState } from '../adapters/insignias'
import {
  backgroundShapes,
  groupColor,
  compositionAppearance,
  compositionAvailable,
  elementGroups,
  freeRecipe,
  groupOf,
  selectElement,
  setElementColor,
  shuffleRecipe,
} from '../client-model/insignia-composer'
import { symbolAccess } from '../client-model/insignias'
import { Button } from '../ui/button'
import { EmpireInsignia } from './empire-insignia'
import styles from './insignia.module.css'
export function InsigniaComposer({
  snapshot,
  recipe,
  now,
  busy,
  onChange,
}: {
  snapshot: InsigniaState
  recipe: InsigniaRecipe
  now: number
  busy: boolean
  onChange: (r: InsigniaRecipe) => void
}) {
  const advanced =
    !!snapshot.dyes?.length || compositionAvailable(snapshot, now)
  return (
    <div className={styles.composer}>
      <p>
        {snapshot.dyes?.length
          ? 'Choose your elements, then combine accessible dyes with a finish and an effect. Permanent rewards remain usable without membership.'
          : snapshot.policy === 'unrestricted'
            ? 'Choose a center, an accent, and up to two stripes. Make each group your own color.'
            : 'Choose one center and one accent. Members can add up to two stripes and use three element colors.'}
      </p>
      <fieldset disabled={busy}>
        <legend>Background shape</legend>
        <div className={`${styles.elementGrid} ${styles.shapeGrid}`}>
          {backgroundShapes.map((shape) => (
            <button
              key={shape.id}
              type="button"
              aria-label={shape.name}
              aria-pressed={(recipe.shape ?? 'shield') === shape.id}
              onClick={() => onChange({ ...recipe, shape: shape.id })}
            >
              <EmpireInsignia
                appearance={compositionAppearance(snapshot, {
                  ...recipe,
                  shape: shape.id,
                })}
                size="medium"
              />
              <span>{shape.name}</span>
            </button>
          ))}
        </div>
      </fieldset>
      <div className={styles.actions}>
        <Button
          type="button"
          variant="secondary"
          disabled={busy}
          onClick={() => onChange(shuffleRecipe(snapshot, recipe, now))}
        >
          Shuffle
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={busy}
          onClick={() => onChange({ ...recipe, layers: [] })}
        >
          Clear elements
        </Button>
      </div>
      {elementGroups.map((group) => (
        <fieldset key={group} disabled={busy}>
          <legend>
            {group === 'center'
              ? 'Center'
              : group === 'stripes'
                ? snapshot.policy === 'unrestricted' || snapshot.dyes?.length
                  ? 'Stripes · Up to 2'
                  : 'Stripes · Membership · Up to 2'
                : 'Accents'}
          </legend>
          <div
            className={`${styles.elementGrid} ${group === 'stripes' ? styles.stripeGrid : ''}`}
          >
            {snapshot.catalog
              .filter((e) => e.group === group)
              .sort((a, b) => Number(b.supporter) - Number(a.supporter))
              .map((item) => {
                const selected = recipe.layers?.some(
                    (l) => l.symbol === item.id,
                  ),
                  access = symbolAccess(snapshot, item.id, now)
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-label={item.name}
                    aria-pressed={selected}
                    disabled={
                      access !== 'available' ||
                      (group === 'stripes' && !advanced)
                    }
                    onClick={() =>
                      onChange(selectElement(snapshot, recipe, item.id))
                    }
                  >
                    <EmpireInsignia
                      appearance={compositionAppearance(snapshot, {
                        ...recipe,
                        layers: [
                          {
                            symbol: item.id,
                            color:
                              recipe.layers?.find(
                                (l) => groupOf(snapshot, l.symbol) === group,
                              )?.color ?? recipe.foreground,
                          },
                        ],
                      })}
                      size="medium"
                    />
                    <span>{item.name}</span>
                    {item.supporter && (
                      <small>
                        {snapshot.library.permanent_symbols.includes(item.id)
                          ? 'Yours permanently'
                          : 'Membership'}
                      </small>
                    )}
                  </button>
                )
              })}
          </div>
          {!snapshot.catalog.some((e) => e.group === group) && (
            <p>No {group} installed on this server.</p>
          )}
        </fieldset>
      ))}
      <div
        className={styles.colors}
        data-named-colors={snapshot.dyes?.length ? true : undefined}
      >
        {advanced ? (
          elementGroups.map((group) => (
            <div key={group}>
              <CosmeticColor
                snapshot={snapshot}
                label={`${group === 'center' ? 'Center' : group === 'stripes' ? 'Stripe' : 'Accent'} color`}
                value={groupColor(snapshot, recipe, group) ?? recipe.foreground}
                description={
                  groupColor(snapshot, recipe, group) === undefined
                    ? 'Select an element to set its color.'
                    : undefined
                }
                disabled={
                  busy || groupColor(snapshot, recipe, group) === undefined
                }
                onChange={(color) =>
                  onChange({
                    ...setElementColor(snapshot, recipe, group, color),
                    version: snapshot.dyes?.length ? 3 : recipe.version,
                  })
                }
              />
            </div>
          ))
        ) : (
          <CosmeticColor
            snapshot={snapshot}
            label="Element color"
            value={recipe.foreground}
            disabled={busy}
            onChange={(color) =>
              onChange({
                ...setElementColor(snapshot, recipe, null, color),
                version: snapshot.dyes?.length ? 3 : recipe.version,
              })
            }
          />
        )}
        <CosmeticColor
          snapshot={snapshot}
          label="Background color"
          value={recipe.background}
          disabled={busy}
          onChange={(color) =>
            onChange({
              ...recipe,
              version: snapshot.dyes?.length ? 3 : recipe.version,
              background: color,
            })
          }
        />
      </div>
      <CosmeticTreatments
        snapshot={snapshot}
        recipe={recipe}
        busy={busy}
        onChange={onChange}
      />
      {!advanced && (
        <Button
          type="button"
          variant="ghost"
          disabled={busy}
          onClick={() => onChange(freeRecipe(snapshot, recipe, now))}
        >
          Use free elements and one color
        </Button>
      )}
    </div>
  )
}
