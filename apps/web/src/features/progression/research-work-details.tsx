import type { Coordinator } from '../../client-model/coordinator'
import type { researchProgress } from '../../client-model/research-progress'
import { ConfirmationButton } from '../../ui/confirmation-button'
import { label } from '../../ui/format'
import { ActiveWorkDetails, RefundAmounts } from './active-work-details'
import { DetailRow } from './detail-layout'
import styles from './detail-layout.module.css'

export function ResearchWorkDetails({
  research,
  model,
}: {
  research: NonNullable<ReturnType<typeof researchProgress>>
  model: Coordinator
}) {
  const verb = 'Researching'
  const target = `${verb} ${label(research.research)} to level ${research.targetLevel}`
  return (
    <ActiveWorkDetails
      label="Active research"
      title={`${verb} to level ${research.targetLevel}`}
      accessibleTitle={target}
      secondsRemaining={research.secondsRemaining}
      dueAt={research.dueAt}
      status={research.status}
      paid={research.paid}
    >
      <ConfirmationButton
        key={research.operationId ?? 'pending'}
        variant="secondary"
        className={styles.cancelWork}
        dialogTitle="Cancel research?"
        confirmLabel="Confirm cancellation"
        cancelLabel="Keep research"
        review={
          <>
            <p>
              Cancel {verb.toLowerCase()} {label(research.research)} to level{' '}
              {research.targetLevel}? Progress on this level will be lost.
            </p>
            <dl className={styles.compare}>
              <DetailRow label="Full refund">
                <RefundAmounts paid={research.paid} />
              </DetailRow>
            </dl>
          </>
        }
        disabled={!research.canCancel}
        onConfirm={() => {
          if (research.operationId && research.canCancel)
            void model.send({
              type: 'CancelResearch',
              operation: research.operationId,
            })
        }}
      >
        Cancel research
      </ConfirmationButton>
    </ActiveWorkDetails>
  )
}
