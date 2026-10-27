import type {
  HTMLAttributes,
  CSSProperties,
  ReactNode,
  MouseEventHandler,
} from 'react'
import { useId } from 'react'
import { FlaskConical } from 'lucide-react'
import { classes } from './classes'
import { VisuallyHidden } from './visually-hidden'
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
  href,
  title,
  level,
  art,
  selected,
  locked,
  unaffordable,
  countLabel = 'Level',
  inspectable = false,
  disabledReason = 'unavailable',
  className,
  progress,
  action,
  ...props
}: Omit<HTMLAttributes<HTMLElement>, 'title'> & {
  disabled?: boolean
  href?: string
  onClick?: MouseEventHandler<HTMLElement>
  title: string
  level: number | string
  art: CatalogArt
  selected?: boolean
  locked?: boolean
  unaffordable?: boolean
  countLabel?: string
  inspectable?: boolean
  disabledReason?: string
  action?: ReactNode
  progress?: {
    kind?: 'construction' | 'research'
    targetLevel: number
    direction: 'up' | 'down'
    countdown: string
    status: string
  } | null
}) {
  const progressId = useId()
  const Tile = href ? 'a' : 'button'
  return (
    <div className={styles.tileContainer}>
      <Tile
        href={href}
        type={href ? undefined : 'button'}
        className={classes(
          styles.tile,
          !!action && styles.withAction,
          selected && styles.selected,
          locked && styles.locked,
          props.disabled && styles.unavailable,
          unaffordable && styles.unaffordable,
          !!progress && styles.working,
          className,
        )}
        aria-pressed={href ? undefined : selected}
        aria-current={href && selected ? 'page' : undefined}
        aria-describedby={progress ? progressId : undefined}
        title={
          props.disabled
            ? `${title} · ${disabledReason}`
            : `${title} · ${countLabel} ${level}${locked ? ' · prerequisites required' : ''}${unaffordable ? ' · Not enough resources' : ''}`
        }
        {...props}
        disabled={href ? undefined : props.disabled && !inspectable}
      >
        <span className={styles.artwork}>
          <CatalogImage
            art={art}
            sizes="(max-width: 767px) 52px, 100px"
            loading="lazy"
          />
        </span>
        <span className={styles.caption}>
          <span>{title}</span>
          {progress && progress.kind !== 'research' ? (
            <strong
              id={progressId}
              role="group"
              aria-label="Construction progress"
            >
              {countLabel} {level} →{' '}
              <b aria-label={`Target level ${progress.targetLevel}`}>
                {countLabel} {progress.targetLevel}
              </b>
              <VisuallyHidden>
                {' '}
                · {progress.status} · {progress.countdown}
              </VisuallyHidden>
            </strong>
          ) : (
            <strong>
              {countLabel} {level}
            </strong>
          )}
          {inspectable && (props.disabled || locked) && (
            <small>
              {props.disabled
                ? 'Unavailable · Inspect details'
                : 'Prerequisites required'}
            </small>
          )}
        </span>
        {progress && !action && (
          <span
            id={progress.kind === 'research' ? progressId : undefined}
            className={styles.progress}
            role={progress.kind === 'research' ? 'group' : undefined}
            aria-label={
              progress.kind === 'research' ? 'Research progress' : undefined
            }
          >
            {progress.kind === 'research' && (
              <span className={styles.progressHeader}>
                <span className={styles.direction} aria-label="Researching">
                  <FlaskConical size={14} aria-hidden="true" />
                </span>
                <strong aria-label={`Target level ${progress.targetLevel}`}>
                  {progress.targetLevel}
                </strong>
              </span>
            )}
            <span className={styles.countdown}>
              {progress.countdown}
              {progress.status !== 'In progress' &&
                progress.status !== progress.countdown && (
                  <small>{progress.status}</small>
                )}
            </span>
          </span>
        )}
      </Tile>
      {action && <div className={styles.action}>{action}</div>}
    </div>
  )
}
