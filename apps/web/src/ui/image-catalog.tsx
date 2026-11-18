import type {
  HTMLAttributes,
  CSSProperties,
  ReactNode,
  MouseEventHandler,
} from 'react'
import { useId } from 'react'
import { classes } from './classes'
import { VisuallyHidden } from './visually-hidden'
import hidden from './visually-hidden.module.css'
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
    <span
      aria-hidden="true"
      data-touch-control=""
      className={classes(styles.image, className)}
    >
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
  description,
  actions,
  children,
}: {
  title: string
  description?: ReactNode
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <section className={styles.frame} aria-label={title}>
      {actions || description ? (
        <div className={styles.header}>
          <div className={styles.headingGroup}>
            <h2>{title}</h2>
            {description && (
              <span className={styles.description}>{description}</span>
            )}
          </div>
          {actions && <div className={styles.headerActions}>{actions}</div>}
        </div>
      ) : (
        <h2>{title}</h2>
      )}
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

/** Shared timer for catalog progress and the quick-build feedback slot. */
export function CatalogCountdown({
  children,
  status,
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { status?: string }) {
  return (
    <span className={classes(styles.countdown, className)} {...props}>
      <span className={styles.time}>{children}</span>
      {status && <small>{status}</small>}
    </span>
  )
}

function ShortLevel({ level }: { level: number | string }) {
  return (
    <>
      <span aria-hidden="true">Lvl {level}</span>
      <span className={hidden.hidden}>Level {level}</span>
    </>
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
  compactCaption,
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
  compactCaption?: { summary: ReactNode }
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
    <div className={styles.tileContainer} data-touch-control="">
      <Tile
        href={href}
        type={href ? undefined : 'button'}
        className={classes(
          styles.tile,
          compactCaption && styles.compactTile,
          selected && styles.selected,
          locked && styles.locked,
          props.disabled && styles.unavailable,
          unaffordable && styles.unaffordable,
          !!progress && styles.working,
          className,
        )}
        aria-pressed={href ? undefined : selected}
        aria-current={href && selected ? 'page' : undefined}
        aria-describedby={progress || compactCaption ? progressId : undefined}
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
        <span
          className={styles.caption}
          id={compactCaption ? progressId : undefined}
        >
          <span
            className={
              compactCaption ? styles.inlineHeading : styles.tileHeading
            }
          >
            <span>{title}</span>
            {compactCaption && (
              <strong>
                <ShortLevel level={level} />
              </strong>
            )}
          </span>
          {progress ? (
            <strong
              id={compactCaption ? undefined : progressId}
              role="group"
              aria-label={
                progress.kind === 'research'
                  ? 'Research progress'
                  : 'Construction progress'
              }
            >
              {compactCaption ? '→ ' : `${countLabel} ${level} → `}
              <b aria-label={`Target level ${progress.targetLevel}`}>
                {compactCaption ? 'Lvl' : countLabel} {progress.targetLevel}
              </b>
              <VisuallyHidden>
                {' '}
                · {progress.status} · {progress.countdown}
              </VisuallyHidden>
            </strong>
          ) : compactCaption ? (
            compactCaption.summary
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
          <CatalogCountdown
            className={styles.progress}
            aria-label={`${title} time remaining`}
            status={
              progress.status !== 'In progress' &&
              progress.status !== progress.countdown
                ? progress.status
                : undefined
            }
          >
            {progress.countdown}
          </CatalogCountdown>
        )}
      </Tile>
      {action && <div className={styles.action}>{action}</div>}
    </div>
  )
}
