import type { Coordinator } from '../../client-model/coordinator'
import type { buildingProgress } from '../../client-model/building-progress'
import { ConfirmationButton } from '../../ui/confirmation-button'
import { label } from '../../ui/format'
import { ActiveWorkDetails, RefundAmounts } from './active-work-details'
import { DetailRow } from './detail-layout'
import styles from './detail-layout.module.css'

export function ConstructionDetails({
  work,
  model,
}: {
  work: NonNullable<ReturnType<typeof buildingProgress>>
  model: Coordinator
}) {
  const verb = work.direction === 'down' ? 'Tearing down' : 'Upgrading'
  const target = `${verb} ${label(work.building)} to level ${work.targetLevel}`
  return (
    <ActiveWorkDetails
      label="Active construction"
      title={`${verb} to level ${work.targetLevel}`}
      accessibleTitle={target}
      secondsRemaining={work.secondsRemaining}
      dueAt={work.dueAt}
      status={work.status}
      paid={work.paid}
    >
      <ConfirmationButton
        key={work.operationId ?? 'pending'}
        variant="secondary"
        className={styles.cancelWork}
        dialogTitle="Cancel construction?"
        confirmLabel="Confirm cancellation"
        cancelLabel="Keep construction"
        review={
          <>
            <p>
              Cancel {verb.toLowerCase()} {label(work.building)} to level{' '}
              {work.targetLevel}? Progress on this level will be lost.
            </p>
            <dl className={styles.compare}>
              <DetailRow label="Full refund">
                <RefundAmounts paid={work.paid} />
              </DetailRow>
            </dl>
          </>
        }
        disabled={!work.canCancel}
        onConfirm={() => {
          if (work.operationId && work.canCancel)
            void model.send({
              type: 'CancelConstruction',
              operation: work.operationId,
            })
        }}
      >
        Cancel construction
      </ConfirmationButton>
    </ActiveWorkDetails>
  )
}
