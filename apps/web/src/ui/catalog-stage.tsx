import { useEffect, useRef, type ReactNode } from 'react'
import styles from './catalog-stage.module.css'

/** Inline details shared by catalogs. The caller owns selection and
 * restores its opener; closed details are hidden immediately.
 */
export function CatalogStage({
  footer,
  open,
  detailKey,
  detailLabel,
  children,
}: {
  footer?: ReactNode
  open: boolean
  detailKey: string
  detailLabel: string
  children: ReactNode
}) {
  const stage = useRef<HTMLDivElement>(null)
  const panel = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!open) return
    const opener = document.activeElement
    const frame = requestAnimationFrame(() => {
      // Wait for route focus restoration before focusing the detail panel.
      if (document.activeElement === opener) {
        panel.current?.focus({ preventScroll: true })
        stage.current?.scrollIntoView({ block: 'nearest', behavior: 'instant' })
      }
    })
    return () => {
      cancelAnimationFrame(frame)
    }
  }, [open, detailKey])
  return (
    <div ref={stage} className={styles.stage} hidden={!open && !footer}>
      <section
        ref={panel}
        className={styles.panel}
        hidden={!open}
        aria-label={detailLabel}
        aria-hidden={!open}
        inert={!open}
        tabIndex={-1}
      >
        {children}
      </section>
      {!open && footer && <div className={styles.footer}>{footer}</div>}
    </div>
  )
}
