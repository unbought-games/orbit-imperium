import type { ComponentProps } from 'react'
import type { Coordinator } from '../client-model/coordinator'
import {
  formatLostWork,
  workCancellation,
  type CancellationKind,
} from '../client-model/work-cancellation'
import { ConfirmationButton } from '../ui/confirmation-button'
import styles from './work-cancellation-button.module.css'

/** Share the undo policy across details, summaries and the legacy economy view. */
export function WorkCancellationButton({
  model,
  operationId,
  kind,
  review,
  disabled,
  onConfirm,
  ...props
}: Omit<ComponentProps<typeof ConfirmationButton>, 'requiresConfirmation'> & {
  model?: Coordinator | null
  operationId: string | null
  kind: CancellationKind
}) {
  const current = () =>
    model ? workCancellation(model.store.getState(), kind, operationId) : null
  const policy = current()
  return (
    <ConfirmationButton
      {...props}
      disabled={disabled || (policy !== null && !policy.canCancel)}
      requiresConfirmation={() => {
        model?.tick()
        return current()?.requiresConfirmation ?? true
      }}
      onConfirm={() => {
        model?.tick()
        if (!disabled && (current()?.canCancel ?? true)) onConfirm()
      }}
      review={
        <>
          <p className={styles.warning}>
            <strong>
              {policy?.elapsedMs != null
                ? `${formatLostWork(policy.elapsedMs)} of work will be lost.`
                : 'All progress on this level will be lost.'}
            </strong>{' '}
            Cancelling cannot be undone. Starting again begins from zero.
          </p>
          {review}
        </>
      }
    />
  )
}
