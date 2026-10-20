import type { ComponentPropsWithRef, CSSProperties, ReactNode } from 'react'
import { useId } from 'react'
import { ArrowDown, ArrowUp, Hammer, FlaskConical } from 'lucide-react'
import { classes } from './classes'
import styles from './image-catalog.module.css'
export type CatalogSprite = {
  columns: number
  rows: number
  column: number
  row: number
  cellAspectRatio?: number
}
export type CatalogArt = {
  src: string
  sprite?: CatalogSprite
  srcSet?: string
  width?: number
  height?: number
}
export function CatalogImage({
  art,
  className,
  sizes = '(max-width: 760px) 90vw, 42vw',
  loading,
}: {
  art: CatalogArt
  className?: string
  sizes?: string
  loading?: 'lazy' | 'eager'
}) {
  const sprite = art.sprite
  const ratio = sprite?.cellAspectRatio ?? 1
  return (
    <span aria-hidden="true" className={classes(styles.image, className)}>
      {sprite ? (
        <svg
          viewBox={`${sprite.column * ratio} ${sprite.row} ${ratio} 1`}
          preserveAspectRatio="xMidYMid slice"
          focusable="false"
        >
          <image
            href={art.src}
            width={sprite.columns * ratio}
            height={sprite.rows}
          />
        </svg>
      ) : (
        <img
          src={art.src}
          srcSet={art.srcSet}
          sizes={sizes}
          width={art.width}
          height={art.height}
          loading={loading}
          decoding="async"
          onError={(event) => {
            event.currentTarget.style.opacity = '0'
          }}
          onLoad={(event) => {
            event.currentTarget.style.opacity = '1'
          }}
          alt=""
        />
      )}
    </span>
  )
}

export function CatalogSection({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <section className={styles.frame} aria-label={title}>
      <h2>{title}</h2>
      {children}
    </section>
  )
}
export function ImageCatalog({
  children,
  columns = 6,
}: {
  children: ReactNode
  columns?: number
}) {
  return (
    <div
      className={styles.grid}
      style={{ '--catalog-columns': columns } as CSSProperties}
    >
      {children}
    </div>
  )
}
export function ImageTile({
  title,
  level,
  art,
  selected,
  locked,
  unaffordable,
  countLabel = 'Level',
  disabledReason = 'unavailable',
  className,
  progress,
  onQuickUpgrade,
  ...props
}: Omit<ComponentPropsWithRef<'button'>, 'title'> & {
  title: string
  level: number | string
  art: CatalogArt
  selected?: boolean
  locked?: boolean
  unaffordable?: boolean
  onQuickUpgrade?: () => void
  countLabel?: string
  disabledReason?: string
  progress?: {
    kind?: 'construction' | 'research'
    targetLevel: number
    direction: 'up' | 'down'
    countdown: string
    status: string
  } | null
}) {
  const progressId = useId()
  return (
    <div className={styles.tileContainer}>
      <button
        type="button"
        className={classes(
          styles.tile,
          selected && styles.selected,
          locked && styles.locked,
          unaffordable && styles.unaffordable,
          !!progress && styles.working,
          className,
        )}
        aria-pressed={selected}
        aria-describedby={progress ? progressId : undefined}
        title={
          props.disabled
            ? `${title} · ${disabledReason}`
            : `${title} · ${countLabel} ${level}${locked ? ' · prerequisites required' : ''}${unaffordable ? ' · Not enough resources' : ''}`
        }
        {...props}
      >
        <span className={styles.artwork}>
          <CatalogImage art={art} sizes="100px" loading="lazy" />
          {progress && (
            <span
              id={progressId}
              className={styles.progress}
              role="group"
              aria-label={
                progress.kind === 'research'
                  ? 'Research progress'
                  : 'Construction progress'
              }
            >
              <span className={styles.progressHeader}>
                <span
                  className={styles.direction}
                  aria-label={
                    progress.kind === 'research'
                      ? 'Researching'
                      : progress.direction === 'up'
                        ? 'Upgrading'
                        : 'Tearing down'
                  }
                >
                  {progress.kind === 'research' ? (
                    <FlaskConical size={18} aria-hidden="true" />
                  ) : progress.direction === 'up' ? (
                    <Hammer size={18} aria-hidden="true" />
                  ) : (
                    <ArrowDown size={18} aria-hidden="true" />
                  )}
                </span>
                <strong aria-label={`Target level ${progress.targetLevel}`}>
                  {progress.targetLevel}
                </strong>
              </span>
              <span className={styles.countdown}>
                {progress.countdown}
                {progress.status !== 'In progress' &&
                  progress.status !== progress.countdown && (
                    <small>{progress.status}</small>
                  )}
              </span>
            </span>
          )}
        </span>
        <span className={styles.caption}>
          <span>{title}</span>
          <strong>
            {countLabel} {level}
          </strong>
        </span>
      </button>
      {onQuickUpgrade && (
        <button
          type="button"
          className={styles.quickUpgrade}
          aria-label={`Start upgrade ${title}`}
          title={`Start upgrade ${title}`}
          onClick={onQuickUpgrade}
        >
          <ArrowUp size={16} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
