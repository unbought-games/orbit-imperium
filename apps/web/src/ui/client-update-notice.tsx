import { useStore } from 'zustand'
import { clientUpdate } from '../adapters/client-update'
import { incompatibleResponseMessage } from '../client-model/contract-error'
import { Button } from './button'
import styles from './client-update-notice.module.css'

export function ClientUpdateNotice() {
  const state = useStore(clientUpdate.store)
  return (
    <div
      role={state.status === 'current' ? undefined : 'status'}
      aria-live="polite"
      aria-atomic="true"
      data-testid="client-update-announcement"
    >
      {state.status !== 'current' && (
        <div className={styles.notice} data-client-update="">
          <p>
            {state.status === 'refreshing'
              ? 'An update is available. Refreshing…'
              : state.status === 'blocked'
                ? 'An update is still needed. Automatic refresh is paused to avoid repeated reloads. You can try again now.'
                : incompatibleResponseMessage}
          </p>
          {state.status !== 'refreshing' && (
            <Button variant="secondary" onClick={clientUpdate.reload}>
              Reload app
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
