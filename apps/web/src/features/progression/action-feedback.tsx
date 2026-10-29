import { useStore } from 'zustand'
import { CheckCircle2, Clock3, AlertTriangle } from 'lucide-react'
import type { Coordinator } from '../../client-model/coordinator'
import { Button } from '../../ui/button'
import { actionLabel, actionMessage } from '../../ui/action-announcements'
import {
  latestProgressionAttempt,
  type ActionTarget,
} from './action-feedback-model'
import styles from './action-feedback.module.css'

/** Read the durable result, never infer success from a resolved send promise. */
export function ProgressionActionFeedback({
  model,
  body,
  item,
}: ActionTarget & { model: Coordinator }) {
  const attempts = useStore(model.store, (state) => state.attempts)
  const latest = latestProgressionAttempt(attempts, { body, item })
  if (!latest) return null
  const warning = latest.status === 'uncertain' || latest.status === 'rejected'
  const Icon = warning
    ? AlertTriangle
    : latest.status === 'committed'
      ? CheckCircle2
      : Clock3
  return (
    <div
      className={styles.feedback}
      data-state={latest.status}
      // The shell's shared live region announces these same ledger transitions.
      // Keep the nearby visual result readable without announcing it twice.
      role="group"
      aria-label="Latest action result"
    >
      <Icon size={18} aria-hidden="true" />
      <div>
        <strong>Last submitted: {actionLabel(latest.envelope.command)}</strong>
        <p>{actionMessage(latest)}</p>
        {latest.status === 'uncertain' && (
          <Button
            variant="secondary"
            onClick={() => void model.retryOrder(latest.envelope.command_id)}
          >
            Retry order
          </Button>
        )}
      </div>
    </div>
  )
}
