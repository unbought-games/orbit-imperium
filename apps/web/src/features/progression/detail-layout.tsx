import type { ReactNode } from 'react'
import { label } from '../../ui/format'
import { ArrowLeft } from 'lucide-react'
import { ButtonLinkAnchor } from '../../ui/button'
import { CatalogImage } from '../../ui/image-catalog'
import { OrbitDiagram } from './progression-world'
import type { CatalogContent } from './catalog-content'
import type { CatalogSelection } from '../../shell/use-catalog-selection'
import styles from './detail-layout.module.css'

/** One reading order for every item: current state, decision, then supporting art. */
export function DetailLayout({
  content,
  back,
  children,
  footer,
}: {
  content: CatalogContent
  back: CatalogSelection['back']
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <article className={styles.detail}>
      <header className={styles.header}>
        <ButtonLinkAnchor variant="secondary" size="icon-small" {...back}>
          <ArrowLeft size={18} aria-hidden="true" />
        </ButtonLinkAnchor>
        <div>
          <h2>{label(content.id)}</h2>
        </div>
      </header>
      <div className={styles.layout}>
        <div className={styles.decision}>{children}</div>
        <figure
          className={styles.visual}
          aria-label={`${label(content.id)} illustration`}
        >
          <OrbitDiagram />
          <CatalogImage
            art={content.art}
            className={styles.hero}
            sizes="(max-width: 767px) 380px, 55vw"
          />
          <figcaption>
            <span className={styles.eyebrow}>Field notes</span>
            <p>{content.description}</p>
          </figcaption>
        </figure>
      </div>
      {footer && <div className={styles.footer}>{footer}</div>}
    </article>
  )
}

export function DetailSection({
  title,
  label,
  children,
}: {
  title?: string
  label?: string
  children: ReactNode
}) {
  return (
    <section className={styles.section} aria-label={label ?? title}>
      {title && <h3>{title}</h3>}
      {children}
    </section>
  )
}
export function DetailStat({
  label,
  children,
  hint,
}: {
  label: string
  children: ReactNode
  hint?: ReactNode
}) {
  return (
    <div className={styles.stat}>
      <span>{label}</span>
      <strong>{children}</strong>
      {hint && <small>{hint}</small>}
    </div>
  )
}
export function DetailRow({
  label,
  children,
  warning = false,
  hint,
}: {
  label: string
  children: ReactNode
  warning?: boolean
  hint?: ReactNode
}) {
  return (
    <div className={`${styles.row} ${warning ? styles.warning : ''}`}>
      <dt>{label}</dt>
      <dd>{children}</dd>
      {hint && <dd className={styles.rowHint}>{hint}</dd>}
    </div>
  )
}

/** A compact empty footprint introduces the first construction decision. */
export function DetailIntroduction({ name }: { name: string }) {
  return (
    <div className={styles.introduction}>
      <div className={styles.emptyFootprint}>
        <span>No {name}</span>
      </div>
      <h3>First Build</h3>
    </div>
  )
}
