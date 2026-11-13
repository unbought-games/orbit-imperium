import { connectionStatus } from '../client-model/connection-status'
import { ConnectionNotice } from './connection-notice'
import styles from './action-status.module.css'
import { VisuallyHidden } from './visually-hidden'
import { Button } from './button'
import { X } from 'lucide-react'
import { useStore } from 'zustand'
import { useEffect, useRef, useState } from 'react'
import {
  actionLabel,
  visibleAction,
  actionMessage,
  changedAnnouncements,
} from './action-announcements'
import type { Coordinator } from '../client-model/coordinator'
import { hasOrderNotice, type Attempt } from '../client-model/commands'

export function ActionStatus({ model }: { model: Coordinator }) {
  const state = useStore(model.store)
  const connection = connectionStatus(state)
  const attempts = [...state.attempts]
    .filter(
      ([key, attempt]) =>
        visibleAction(attempt) &&
        !(state.hiddenOrderNotices.has(key) && hasOrderNotice(attempt)),
    )
    .map(([, attempt]) => attempt)
  const previous = useRef<Map<string, string> | null>(null)
  // Existing results are already visible on mount; announce only later changes.
  if (!previous.current)
    previous.current = changedAnnouncements(new Map(), attempts).current
  const [announcement, setAnnouncement] = useState('')
  const signature = attempts
    .map((a) => `${a.envelope.command_id}:${a.status}:${a.reconciled}`)
    .join('|')
  useEffect(() => {
    const change = changedAnnouncements(previous.current ?? new Map(), attempts)
    previous.current = change.current
    setAnnouncement(change.message)
  }, [signature])
  // Completed history is intentionally absent. Keep recovery and rejection
  // feedback reachable even when a response was lost or the server refused it.
  const needsAttention = attempts.filter(hasOrderNotice)
  const latest = needsAttention.at(-1)
  const older = needsAttention.slice(0, -1)
  return (
    <>
      <ConnectionNotice status={connection} />
      <VisuallyHidden
        data-testid="order-announcement"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {announcement}
      </VisuallyHidden>
      {(latest || state.message) && (
        <aside
          className={styles.notice}
          data-error-entry=""
          aria-label="Action needs attention"
        >
          <div className={styles.entries}>
            {state.message && (
              <div role="group" aria-label="Current action error">
                <p role="alert">{state.message}</p>
                <Button onClick={() => model.dismissMessage()}>
                  Dismiss message
                </Button>
              </div>
            )}
            {latest && (
              <OrderError
                key={latest.envelope.command_id}
                model={model}
                attempt={latest}
              />
            )}
            {older.length > 0 && (
              <details className={styles.older}>
                <summary>
                  {older.length} more{' '}
                  {older.length === 1 ? 'order needs' : 'orders need'} attention
                </summary>
                {older.map((attempt) => (
                  <OrderError
                    key={attempt.envelope.command_id}
                    model={model}
                    attempt={attempt}
                  />
                ))}
              </details>
            )}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-touch"
            aria-label="Dismiss order notices"
            title="Dismiss order notices"
            onClick={(event) => {
              const surface = event.currentTarget.closest('dialog, main')
              surface
                ?.querySelector<HTMLElement>('h1[tabindex], h2[tabindex]')
                ?.focus({ preventScroll: true })
              model.dismissOrderNotices()
            }}
          >
            <X size={16} aria-hidden="true" />
          </Button>
        </aside>
      )}
    </>
  )
}

function OrderError({
  model,
  attempt,
}: {
  model: Coordinator
  attempt: Attempt
}) {
  const state = model.store.getState()
  return (
    <div role="group" aria-label="Order status">
      <p role="alert">
        <strong>{actionLabel(attempt.envelope.command)}</strong> ·{' '}
        {actionMessage(attempt)}
      </p>
      {attempt.status === 'uncertain' ? (
        <Button
          type="button"
          disabled={state.now < state.retryAt}
          onClick={() => void model.retryOrder(attempt.envelope.command_id)}
        >
          Retry order
        </Button>
      ) : (
        <Button onClick={() => void model.dismiss(attempt.envelope.command_id)}>
          Dismiss notice
        </Button>
      )}
    </div>
  )
}
