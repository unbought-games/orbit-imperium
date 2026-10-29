import type { connectionStatus } from '../client-model/connection-status'
import { VisuallyHidden } from './visually-hidden'

/** Announce state transitions; keep the readable countdown out of live regions. */
export function ConnectionNotice({
  status,
  className,
}: {
  status: ReturnType<typeof connectionStatus>
  className?: string
}) {
  return (
    <>
      {status && (
        <p className={className} aria-live="off">
          {status.message}
        </p>
      )}
      <VisuallyHidden
        role={status?.kind === 'connection' ? 'alert' : 'status'}
        aria-live={status?.kind === 'connection' ? 'assertive' : 'polite'}
        aria-atomic="true"
      >
        {status?.announcement ?? ''}
      </VisuallyHidden>
    </>
  )
}
