import { useContext, type ReactNode } from 'react'
import { ScreenContext } from '../shell/screen-context'
import { SessionContext } from '../shell/session-context'
import { galaxyTarget, readCoordinates } from '../shell/galaxy-location'
import { coordinates } from '../ui/format'
import { Link } from '../ui/link'

/** Recorded coordinates remain navigable even when the historical entity is gone. */
export function CoordinateLink({
  at,
  label,
  children,
  origin,
  className,
}: {
  at: unknown
  label?: string
  children?: ReactNode
  origin?: string
  className?: string
}) {
  const screen = useContext(ScreenContext)
  const session = useContext(SessionContext)
  const context = screen ?? session
  const body = origin ?? screen?.body?.id
  const location = readCoordinates(at)
  const text =
    children ??
    (location ? coordinates({ coordinates: location }) : 'Unavailable')
  if (
    !location ||
    !context ||
    !body ||
    !context.view.capabilities.some(
      (c) => c.capability === 'Galaxy' && c.enabled,
    )
  )
    return className ? <span className={className}>{text}</span> : <>{text}</>
  return (
    <Link
      {...galaxyTarget(context.universeName, body, location)}
      className={className}
      aria-label={`View ${label ? `${label} ` : ''}${coordinates({ coordinates: location })} in galaxy`}
    >
      {text}
    </Link>
  )
}
