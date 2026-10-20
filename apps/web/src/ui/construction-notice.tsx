import type { Coordinator } from '../client-model/coordinator'
import {
  activeAttempt,
  pendingConstruction,
} from '../client-model/game-projection'
import { remaining } from '../client-model/clock'
import { Button } from './button'
import { label } from './format'
import styles from './construction-notice.module.css'

export function ConstructionNotice({
  model,
  body,
}: {
  model: Coordinator
  body?: string
}) {
  const state = model.store.getState()
  const confirmed = state.view?.constructions.find((work) => work.body === body)
  const optimistic = body ? pendingConstruction(state, body) : null
  const work = confirmed ?? optimistic
  if (!work) return null
  const seconds = remaining(
    work.due_at,
    state.view!.sampled_at,
    state.receivedAt,
    state.now,
  )
  const operation = confirmed?.id ?? optimistic?.operationId
  const cancelling = [...state.attempts.values()].some(
    (attempt) =>
      activeAttempt(attempt, state.view) &&
      attempt.envelope.command.type === 'CancelConstruction' &&
      attempt.envelope.command.operation === operation,
  )
  const status = cancelling
    ? 'Cancelling · awaiting server confirmation'
    : confirmed
      ? 'Construction in progress'
      : optimistic?.status === 'uncertain'
        ? 'Connection interrupted · awaiting confirmation'
        : optimistic?.status === 'pending'
          ? 'Construction order accepted'
          : 'Submitting construction'
  return (
    <section className={styles.notice} aria-label="Construction status">
      <div className={styles.details}>
        <strong>
          {label(work.building)} → level {work.target_level}
        </strong>
        <span role="status">{status}</span>
        <span className={styles.timer}>
          {seconds === null
            ? 'Awaiting confirmation'
            : `${seconds} seconds remaining`}
          {!confirmed && ' (estimated)'}
        </span>
      </div>
      <div className={styles.action}>
        <Button
          variant="quiet"
          disabled={!operation || cancelling}
          onClick={() => {
            if (operation)
              void model.send({ type: 'CancelConstruction', operation })
          }}
        >
          Cancel construction
        </Button>
        <small>
          {operation
            ? 'Full refund before completion'
            : 'Available after acceptance'}
        </small>
      </div>
    </section>
  )
}
