import { useEffect, useRef, type ReactNode } from 'react'
import { classes } from './classes'
import { CatalogImage, type CatalogSprite } from './image-catalog'
import styles from './catalog-stage.module.css'

/** Inline scene/detail transition shared by building, research and unit catalogs.
 * Closed details stay mounted for the exit animation, but are inert and hidden
 * from assistive technology. The caller owns selection and restores its opener.
 */
export function CatalogStage({
  image,
  scene,
  imageSprite,
  sceneLabel,
  footer,
  open,
  detailKey,
  detailLabel,
  onClose,
  children,
}: {
  image?: string
  scene?: ReactNode
  imageSprite?: CatalogSprite
  sceneLabel: string
  footer?: ReactNode
  open: boolean
  detailKey: string
  detailLabel: string
  onClose: () => void
  children: ReactNode
}) {
  const close = useRef(onClose)
  close.current = onClose
  const stage = useRef<HTMLDivElement>(null)
  const panel = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!open) return
    const opener = document.activeElement
    const escape = (event: KeyboardEvent) => {
      // Escape also works during the first animation frame while focus is
      // still on the tile, without dismissing when another surface has focus.
      if (
        event.key === 'Escape' &&
        !event.defaultPrevented &&
        (event.target === opener ||
          stage.current?.contains(event.target as Node))
      ) {
        event.preventDefault()
        close.current()
      }
    }
    document.addEventListener('keydown', escape)
    const frame = requestAnimationFrame(() => {
      // Focus after the entering panel becomes visible. Scroll the stationary
      // stage, not the translated panel, to avoid moving its clipping area.
      if (document.activeElement === opener) {
        panel.current?.focus({ preventScroll: true })
        stage.current?.scrollIntoView({ block: 'nearest', behavior: 'instant' })
      }
    })
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('keydown', escape)
    }
  }, [open, detailKey])
  return (
    <div ref={stage} className={styles.stage}>
      <details className={styles.scene} hidden={open}>
        <summary>{sceneLabel}</summary>
        {scene ??
          (image && (
            <div role="img" aria-label={sceneLabel}>
              <CatalogImage
                art={{ src: image, sprite: imageSprite }}
                className={styles.sceneArtwork}
              />
            </div>
          ))}
      </details>
      <section
        ref={panel}
        className={classes(styles.panel, open && styles.open)}
        aria-label={detailLabel}
        aria-hidden={!open}
        inert={!open}
        tabIndex={-1}
        onKeyDown={(event) => {
          if (open && event.key === 'Escape' && !event.defaultPrevented) {
            event.preventDefault()
            onClose()
          }
        }}
      >
        {children}
      </section>
      {!open && footer && <div className={styles.footer}>{footer}</div>}
    </div>
  )
}
