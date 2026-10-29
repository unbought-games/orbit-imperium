import styles from './action-status.module.css'
import { VisuallyHidden } from './visually-hidden'
import { Button } from './button'
import { useEffect, useRef, useState } from 'react'
import {
  actionLabel,
  visibleAction,
  actionMessage,
  changedAnnouncements,
} from './action-announcements'
import type { Coordinator } from '../client-model/coordinator'

export function ActionStatus({
  model,
}: {
  model: Coordinator
  selectedBody?: string
}) {
  const attempts = [...model.ledger.values()].filter(visibleAction)
  const previous = useRef(new Map<string, string>())
  const [announcement, setAnnouncement] = useState('')
  const signature = attempts
    .map((a) => `${a.envelope.command_id}:${a.status}:${a.reconciled}`)
    .join('|')
  useEffect(() => {
    const change = changedAnnouncements(previous.current, attempts)
    previous.current = change.current
    if (change.message) setAnnouncement(change.message)
  }, [signature])
  // Completed history is intentionally absent. Keep recovery and rejection
  // feedback reachable even when a response was lost or the server refused it.
  const needsAttention = attempts.filter(
    (a) => a.status === 'uncertain' || a.status === 'rejected',
  )
  const latest = needsAttention.at(-1)
  return (
    <>
      <VisuallyHidden role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </VisuallyHidden>
      {(latest || model.message) && (
        <aside className={styles.notice} aria-label="Action needs attention">
          {model.message && (
            <div role="group" aria-label="Current action error">
              <p role="alert">{model.message}</p>
              <Button onClick={() => model.dismissMessage()}>
                Dismiss message
              </Button>
            </div>
          )}
          {latest && (
            <div role="group" aria-label="Saved action">
              <p role="alert">
                <strong>{actionLabel(latest.envelope.command)}</strong> ·{' '}
                {actionMessage(latest)}
              </p>
              {needsAttention.length > 1 && (
                <p>{needsAttention.length} actions need attention.</p>
              )}
              {latest.status === 'uncertain' ? (
                <Button
                  disabled={
                    model.store.getState().now < model.store.getState().retryAt
                  }
                  onClick={() => void model.recover(latest.envelope.command_id)}
                >
                  Resolve saved command
                </Button>
              ) : (
                <Button
                  onClick={() => void model.dismiss(latest.envelope.command_id)}
                >
                  Dismiss notice
                </Button>
              )}
            </div>
          )}
        </aside>
      )}
    </>
  )
}
