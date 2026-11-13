import { ArrowLeft } from 'lucide-react'
import { Link } from '../ui/link'
import { routeTarget } from './route-target'
import { useGameScreen } from './screen-context'
import styles from './settings-back-link.module.css'

/** A stable parent destination, including direct links with no browser history. */
export function SettingsBackLink() {
  const { universeName, body } = useGameScreen()
  return (
    <div className={styles.back}>
      <Link
        {...routeTarget(universeName, 'settings', body?.id)}
        activeOptions={{ exact: true }}
      >
        <ArrowLeft size={16} aria-hidden="true" />
        Back to Settings
      </Link>
    </div>
  )
}
