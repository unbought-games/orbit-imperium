import type {
  ShipAppearanceAction,
  ShipEquipment,
} from '../../client-model/ship-appearance-types'
import { Button } from '../../ui/button'
import { renderStatus } from './model'
import styles from './ship-customizer.module.css'

export function RenderProgress({
  equipment,
  busy,
  run,
}: {
  equipment: ShipEquipment | undefined
  busy: boolean
  run: (action: ShipAppearanceAction, success: string) => Promise<boolean>
}) {
  const render = equipment?.render
  if (!render || render.stage === 'ready') return null
  const status = renderStatus[render.stage]
  return (
    <section className={styles.progress} aria-label="Fleet appearance status">
      <div role="status" aria-live="polite" aria-atomic="true">
        <strong>{status.title}</strong>
        <p>{status.detail}</p>
        {render?.stage === 'failed' && render.error && <p>{render.error}</p>}
        {equipment?.fallback_reason && <p>{equipment.fallback_reason}</p>}
        {equipment?.artwork &&
          render &&
          ['queued', 'rendering', 'preparing', 'failed'].includes(
            render.stage,
          ) && (
            <p>Your previous artwork stays visible while this is prepared.</p>
          )}
      </div>
      <div className={styles.actions}>
        {render?.can_retry && (
          <Button
            variant="secondary"
            size="small"
            disabled={busy}
            onClick={() =>
              void run(
                { type: 'Retry', request_id: render.id },
                'Render retry requested.',
              )
            }
          >
            Retry render
          </Button>
        )}
        {render?.can_cancel && (
          <Button
            variant="ghost"
            size="small"
            disabled={busy}
            onClick={() =>
              void run(
                { type: 'Cancel', request_id: render.id },
                'Cancellation requested. Your design remains saved.',
              )
            }
          >
            Cancel render
          </Button>
        )}
      </div>
    </section>
  )
}
