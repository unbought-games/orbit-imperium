import { AlertTriangle, CheckCircle2, Clock3 } from 'lucide-react'
import type { Attempt } from '../client-model/commands'
import type { Coordinator } from '../client-model/coordinator'
import type { components } from '../contracts'
import { actionMessage } from '../ui/action-announcements'
import { Button } from '../ui/button'
import { CoordinateLink } from './coordinate-link'
import styles from './missions.module.css'

export function DispatchFeedback({
  model,
  attempt,
  destination,
  origin,
}: {
  model: Coordinator
  attempt: Attempt | undefined
  destination: components['schemas']['Coordinates'] | undefined
  origin: string
}) {
  const command = attempt?.envelope.command
  if (
    !attempt ||
    !destination ||
    command?.type !== 'World' ||
    command.action.type !== 'LaunchFleet' ||
    command.action.intent.origin !== origin
  )
    return null
  const warning =
    attempt.status === 'uncertain' || attempt.status === 'rejected'
  const Icon = warning
    ? AlertTriangle
    : attempt.status === 'committed'
      ? CheckCircle2
      : Clock3
  const message =
    attempt.status === 'committed'
      ? attempt.reconciled
        ? 'Fleet sent. You can prepare another fleet.'
        : 'Fleet sent. Updating ships, resources and fleet activity…'
      : attempt.status === 'uncertain'
        ? 'We’re checking whether your fleet launched. It won’t be sent again unless you retry.'
        : attempt.status === 'submitting'
          ? 'Sending fleet order…'
          : attempt.status === 'pending'
            ? 'Order accepted. Waiting for launch confirmation…'
            : actionMessage(attempt)
  return (
    <div
      className={styles.dispatchFeedback}
      data-state={attempt.status}
      // The shared ActionStatus live region already announces ledger changes.
      role="group"
      aria-label="Fleet dispatch result"
    >
      <Icon size={18} aria-hidden="true" />
      <div>
        <strong>
          {command.action.intent.mission} to{' '}
          <CoordinateLink
            at={destination}
            target={
              command.action.intent.destination.type === 'Body' &&
              command.action.intent.destination.expected_kind === 'Moon'
                ? 'moon'
                : command.action.intent.destination.type === 'Debris'
                  ? 'debris'
                  : 'planet'
            }
          />
        </strong>
        <p>{message}</p>
        {attempt.status === 'uncertain' && (
          <Button
            type="button"
            variant="secondary"
            onClick={() => void model.retryOrder(attempt.envelope.command_id)}
          >
            Retry fleet order
          </Button>
        )}
      </div>
    </div>
  )
}
