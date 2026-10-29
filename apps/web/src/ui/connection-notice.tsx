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
        <p data-error-entry="" className={className} aria-live="off">
          {status.message}
        </p>
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
