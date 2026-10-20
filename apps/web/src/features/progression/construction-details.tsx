import { useLayoutEffect, useRef } from 'react'
import type { Coordinator } from '../../client-model/coordinator'
import type { buildingProgress } from '../../client-model/building-progress'
import { Button } from '../../ui/button'
import { costs, label } from '../../ui/format'
import styles from './building-details.module.css'

export function ConstructionDetails({
  work,
  model,
}: {
  work: NonNullable<ReturnType<typeof buildingProgress>>
  model: Coordinator
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  useLayoutEffect(() => {
    heading.current?.focus({ preventScroll: true })
  }, [])
  return (
    <section className={styles.activeWork} aria-label="Active construction">
      <h3 ref={heading} tabIndex={-1}>
        {work.direction === 'down' ? 'Tearing down' : 'Upgrading'}{' '}
        {label(work.building)} to level {work.targetLevel}
      </h3>
      <p>{work.countdown}</p>
      {work.status !== 'In progress' && <p role="status">{work.status}</p>}
      <p>Full refund before completion: {costs(work.paid)}</p>
      <Button
        disabled={!work.canCancel}
        onClick={() => {
          if (work.operationId && work.canCancel)
            void model.send({
              type: 'CancelConstruction',
              operation: work.operationId,
            })
        }}
      >
        Cancel construction
      </Button>
      {!work.operationId && (
        <small>Cancellation is available after confirmation.</small>
      )}
    </section>
  )
}
