import { CoordinateLink } from './coordinate-link'
import { bodyIdentityLabel } from './body-identity-label'
import styles from './body-identity.module.css'

/** Name and coordinates from one historical or currently visible body observation. */
export function BodyIdentity({
  name,
  kind,
  at,
  label,
  coordinatesHidden = false,
}: {
  name?: unknown
  kind?: unknown
  at: unknown
  label?: string
  coordinatesHidden?: boolean
}) {
  const identity = bodyIdentityLabel(name, kind)
  return (
    <span className={styles.identity} data-body-identity="">
      {identity && (
        <span data-body-name="">
          {identity}
          <span data-identity-separator=""> · </span>
        </span>
      )}
      {coordinatesHidden ? (
        <span>Coordinates hidden</span>
      ) : (
        <CoordinateLink
          at={at}
          target={kind === 'Moon' ? 'moon' : 'planet'}
          label={label}
          className={styles.coordinates}
        />
      )}
    </span>
  )
}
