import type { ReactNode } from 'react'
import { Tooltip } from '@base-ui/react/tooltip'
import {
  Check,
  Diamond,
  ListFilter,
  RotateCcw,
  ScanLine,
  TriangleAlert,
  X,
} from 'lucide-react'
import type {
  ShipAppearanceAction,
  ShipEquipment,
  ShipRenderStage,
} from '../../client-model/ship-appearance-types'
import { Button } from '../../ui/button'
import { Popover } from '../../ui/popover'
import tooltipStyles from '../../ui/info-tooltip.module.css'
import styles from './render-progress.module.css'

const steps = [
  { label: 'Queued', icon: ListFilter },
  { label: 'Rendering', icon: ScanLine },
  { label: 'Saved', icon: Diamond },
] as const
const phases: Record<ShipRenderStage, { step: number; interruption?: string }> =
  {
    queued: { step: 0 },
    rendering: { step: 1 },
    preparing: { step: 1 },
    ready: { step: 2 },
    failed: { step: 1, interruption: 'Failed' },
    canceled: { step: 1, interruption: 'Canceled' },
    superseded: { step: 1, interruption: 'Replaced' },
  }

export function RenderProgress({
  equipment,
  showSaved,
  busy,
  run,
  feedback,
}: {
  equipment: ShipEquipment | undefined
  feedback: ReactNode
  showSaved: boolean
  busy: boolean
  run: (action: ShipAppearanceAction) => Promise<boolean>
}) {
  const render = equipment?.render
  const stage = render?.stage
  const phase =
    stage && (stage !== 'ready' || showSaved) ? phases[stage] : undefined
  const active = phase?.step ?? -1
  const interruption = phase?.interruption
  const status = interruption ?? steps[active]?.label ?? ''
  const action = render?.can_retry
    ? 'Retry'
    : render?.can_cancel
      ? 'Cancel'
      : null
  const ActionIcon = action === 'Retry' ? RotateCcw : X
  const detail = [interruption && render?.error, equipment?.fallback_reason]
    .filter(Boolean)
    .join(' ')
  return (
    <section className={styles.strip} aria-label="Fleet appearance status">
      <ol className={styles.steps} aria-label="Save progress">
        {steps.map((step, index) => {
          const current = index === active
          const Icon =
            current && interruption
              ? TriangleAlert
              : current && stage === 'ready'
                ? Check
                : step.icon
          return (
            <li
              key={step.label}
              className={styles.step}
              data-past={index < active || undefined}
              data-stopped={(current && !!interruption) || undefined}
              data-working={
                (current && !interruption && stage !== 'ready') || undefined
              }
              aria-current={current ? 'step' : undefined}
            >
              <Icon size={16} aria-hidden="true" />
              {current ? status : step.label}
            </li>
          )
        })}
      </ol>
      <span className={styles.announcement} role="status" aria-atomic="true">
        {status}
      </span>
      {detail && (
        <Popover
          label="Render details"
          placement="top"
          button={<Button type="button" variant="ghost" size="icon-touch" />}
          trigger={<TriangleAlert size={16} aria-hidden="true" />}
        >
          {detail}
        </Popover>
      )}
      {render && action && (
        <Tooltip.Root>
          <Tooltip.Trigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-touch"
                disabled={busy}
                aria-label={action + ' render'}
                onClick={() =>
                  void run({ type: action, request_id: render.id })
                }
              />
            }
          >
            <ActionIcon size={16} aria-hidden="true" />
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Positioner
              side="top"
              sideOffset={6}
              className={styles.positioner}
            >
              <Tooltip.Popup role="tooltip" className={tooltipStyles.popup}>
                {action} render
              </Tooltip.Popup>
            </Tooltip.Positioner>
          </Tooltip.Portal>
        </Tooltip.Root>
      )}
      {feedback}
    </section>
  )
}
