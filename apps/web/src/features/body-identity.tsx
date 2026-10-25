import { CoordinateLink } from './coordinate-link'
import { bodyIdentityLabel } from './body-identity-label'
import styles from './body-identity.module.css'

/** Name and coordinates from one historical or currently visible body observation. */
export function BodyIdentity({
  name,
  kind,
  at,
  label,
}: {
  name?: unknown
  kind?: unknown
  at: unknown
  label?: string
}) {
  const identity = bodyIdentityLabel(name, kind)
  return (
    <span className={styles.identity}>
      {identity && <>{identity} · </>}
      <CoordinateLink at={at} label={label} className={styles.coordinates} />
    </span>
  )
}
