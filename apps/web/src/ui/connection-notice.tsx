import type { connectionStatus } from '../client-model/connection-status'
import { VisuallyHidden } from './visually-hidden'
import { useStore } from 'zustand'
import { clientUpdate } from '../adapters/client-update'
import { ClientUpdateNotice } from './client-update-notice'
import { Button } from './button'

/** Announce state transitions; keep the readable countdown out of live regions. */
export function ConnectionNotice({
  status,
  className,
}: {
  status: ReturnType<typeof connectionStatus>
  className?: string
}) {
  const updating = useStore(
    clientUpdate.store,
    (state) => state.status !== 'current',
  )
  if (updating) return <ClientUpdateNotice />
  return (
    <>
      {status && (
        <p data-error-entry="" className={className} aria-live="off">
          {status.message}
        </p>
      )}
      {status?.kind === 'incompatible' && (
        <div>
          <Button variant="secondary" onClick={clientUpdate.reload}>
            Reload app
          </Button>
        </div>
      )}
      <VisuallyHidden aria-live="assertive" aria-atomic="true">
        {status?.kind === 'connection' ? status.announcement : ''}
      </VisuallyHidden>
      <VisuallyHidden role="status" aria-live="polite" aria-atomic="true">
        {status?.kind !== 'connection' ? (status?.announcement ?? '') : ''}
      </VisuallyHidden>
    </>
  )
}
