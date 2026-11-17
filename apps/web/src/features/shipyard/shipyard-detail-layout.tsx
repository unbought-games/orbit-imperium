import { Palette } from 'lucide-react'
import { Button } from '../../ui/button'
import { label } from '../../ui/format'
import type { DetailLayoutProps } from '../progression/detail-layout'
import styles from './shipyard.module.css'
import type { ReactNode } from 'react'

export function ShipyardDetailLayout({
  content,
  children,
  footer,
  artwork,
  customize,
}: DetailLayoutProps & {
  artwork: ReactNode
  customize?: () => void
}) {
  return (
    <article className={styles.detail}>
      <header className={styles.header}>
        <h2>{label(content.id)}</h2>
        {customize && (
          <Button variant="secondary" onClick={customize}>
            <Palette size={16} aria-hidden="true" />
            Customize
          </Button>
        )}
      </header>
      <div className={styles.layout}>
        <div className={styles.decision}>{children}</div>
        <figure
          className={styles.visual}
          aria-label={`${label(content.id)} illustration`}
        >
          {artwork}
          <figcaption>{content.description}</figcaption>
        </figure>
      </div>
      {footer && <div className={styles.footer}>{footer}</div>}
    </article>
  )
}
