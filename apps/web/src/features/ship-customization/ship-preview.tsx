import { useState } from 'react'
import { ShipAppearancePreview } from '../../../../../packages/ship-appearance/browser'
import type {
  ShipAppearanceState,
  ShipDesign,
} from '../../client-model/ship-appearance-types'
import { Button } from '../../ui/button'
import styles from './ship-customizer.module.css'

export function ShipPreview({
  state,
  draft,
}: {
  state: ShipAppearanceState
  draft: ShipDesign
}) {
  const [attempt, setAttempt] = useState(0)
  const [failure, setFailure] = useState<{
    input: string
    message: string
  } | null>(null)
  const skin = state.catalog.find(
    (item) =>
      item.id === draft.recipe.skin_id &&
      item.package_revision === draft.recipe.package_revision,
  )
  const primary = state.dyes.find((item) => item.id === draft.recipe.primary)
  const accent = state.dyes.find((item) => item.id === draft.recipe.accent)
  const input = JSON.stringify([
    draft.recipe,
    state.emblem,
    primary?.color,
    accent?.color,
    skin?.package_url,
  ])
  // Do not invent colors for unavailable recipes: preserve their IDs for recovery.
  if (!skin || !primary || !accent)
    return (
      <p className={styles.previewUnavailable}>
        Choose an available skin and dyes to preview this design.
      </p>
    )
  return (
    <div className={styles.previewFrame}>
      <ShipAppearancePreview
        key={attempt}
        skin={skin}
        colors={{ primary: primary.color, accent: accent.color }}
        emblem={state.emblem}
        treatment={draft.recipe.emblem.treatment}
        placement={draft.recipe.emblem.placement}
        className={styles.shipImage}
        alt={`${draft.name} — live ship preview`}
        onError={(message) => setFailure({ input, message })}
      />
      {failure?.input === input && (
        <div className={styles.previewFailure} role="status">
          <p>
            Live preview unavailable. The displayed artwork may not reflect your
            edits.
          </p>
          <Button
            type="button"
            variant="secondary"
            size="small"
            onClick={() => {
              setFailure(null)
              setAttempt((value) => value + 1)
            }}
          >
            Retry preview
          </Button>
        </div>
      )}
    </div>
  )
}
