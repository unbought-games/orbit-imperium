import { useLayoutEffect, useRef } from 'react'
import type { Coordinator } from '../../client-model/coordinator'
import type { researchProgress } from '../../client-model/research-progress'
import { Button } from '../../ui/button'
import { costs, label } from '../../ui/format'
import styles from './building-details.module.css'

export function ResearchWorkDetails({
  research,
  model,
}: {
  research: NonNullable<ReturnType<typeof researchProgress>>
  model: Coordinator
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  useLayoutEffect(() => {
    heading.current?.focus({ preventScroll: true })
  }, [])
  return (
    <section className={styles.activeWork} aria-label="Active research">
      <h3 ref={heading} tabIndex={-1}>
        Researching {label(research.research)} to level {research.targetLevel}
      </h3>
      <p>{research.countdown}</p>
      {research.status !== 'In progress' &&
        research.status !== research.countdown && (
          <p role="status">{research.status}</p>
        )}
      <p>Full refund before completion: {costs(research.paid)}</p>
      <Button
        disabled={!research.canCancel}
        onClick={() => {
          if (research.operationId && research.canCancel)
            void model.send({
              type: 'CancelResearch',
              operation: research.operationId,
            })
        }}
      >
        Cancel research
      </Button>
      {!research.operationId && (
        <small>Cancellation is available after confirmation.</small>
      )}
    </section>
  )
}
