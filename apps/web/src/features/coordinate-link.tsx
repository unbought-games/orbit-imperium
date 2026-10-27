import { universeSlug } from '../client-model/universe-name'
import { useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useSetAtom } from 'jotai'
import { Copy, Check, Ellipsis } from 'lucide-react'
import { ContextMenu } from '@base-ui/react/context-menu'
import { Menu } from '@base-ui/react/menu'
import { ScreenContext } from '../shell/screen-context'
import { SessionContext } from '../shell/session-context'
import { galaxyTarget, readCoordinates } from '../shell/galaxy-location'
import { locationPath, type LocationKind } from '../shell/location-address'
import { coordinates } from '../ui/format'
import { Link } from '../ui/link'
import { Button } from '../ui/button'
import { copiedLocationAtom } from './coordinate-memory'
import { coordinateMissions } from './coordinate-actions'
import styles from './coordinate-link.module.css'
/** Coordinates identify a slot even after its former occupant has disappeared. */
export function CoordinateLink({
  at,
  label,
  children,
  origin,
  className,
  target = 'planet',
  known,
  compact = false,
  onHarvest,
}: {
  at: unknown
  onHarvest?: (opener: HTMLElement | null) => void
  compact?: boolean
  label?: string
  children?: ReactNode
  origin?: string
  className?: string
  target?: LocationKind
  known?: { owner?: string; empty?: boolean; debris?: boolean }
}) {
  const trigger = useRef<HTMLButtonElement>(null)
  const handingOff = useRef(false)
  const screen = useContext(ScreenContext)
  const session = useContext(SessionContext)
  const context = screen ?? session
  const body = origin ?? screen?.body?.id ?? context?.view.bodies[0]?.id
  const location = readCoordinates(at)
  const remember = useSetAtom(copiedLocationAtom)
  const [feedback, setFeedback] = useState('')
  useEffect(() => {
    if (!feedback) return
    const timer = setTimeout(() => setFeedback(''), 4000)
    return () => clearTimeout(timer)
  }, [feedback])
  const text = location ? coordinates({ coordinates: location }) : 'Unavailable'
  if (!location)
    return (
      <span className={className}>
        {children ?? <span className={styles.address}>{text}</span>}
      </span>
    )
  const navigable =
    context &&
    body &&
    context.view.capabilities.some(
      (c) => c.capability === 'Galaxy' && c.enabled,
    )
  const path = context
    ? locationPath(context.universeName, location, { target })
    : ''
  async function copy(link: boolean) {
    try {
      await navigator.clipboard.writeText(
        link ? new URL(path, window.location.origin).href : text,
      )
      remember({ coordinates: location!, target })
      setFeedback(link ? 'Location link copied.' : 'Coordinates copied.')
    } catch {
      setFeedback('Copy failed. Select the coordinates and copy them manually.')
    }
  }
  const items = () => (
    <>
      {navigable && (
        <Menu.LinkItem
          closeOnClick
          className={styles.item}
          render={
            <Link
              {...galaxyTarget(context.universeName, body, {
                ...location,
                ...(target !== 'planet' ? { target } : {}),
              })}
            />
          }
        >
          View in Galaxy
        </Menu.LinkItem>
      )}
      <Menu.Item className={styles.item} onClick={() => void copy(false)}>
        Copy coordinates
      </Menu.Item>
      {context && (
        <Menu.Item className={styles.item} onClick={() => void copy(true)}>
          Copy location link
        </Menu.Item>
      )}
      {context &&
        body &&
        coordinateMissions(context.view, location, target, known).map(
          (mission) => (
            <Menu.LinkItem
              key={mission}
              className={styles.item}
              closeOnClick
              render={
                <Link
                  onClick={(event) => {
                    if (
                      mission === 'Harvest' &&
                      onHarvest &&
                      !event.ctrlKey &&
                      !event.metaKey &&
                      !event.shiftKey &&
                      !event.altKey
                    ) {
                      event.preventDefault()
                      handingOff.current = true
                      onHarvest(trigger.current)
                    }
                  }}
                  to="/u/$universe/b/$body/dispatch"
                  state={{ dispatchObservation: undefined }}
                  params={{
                    universe: universeSlug(context.universeName),
                    body,
                  }}
                  search={{
                    ...location,
                    target: mission === 'Harvest' ? 'debris' : target,
                    mission,
                  }}
                />
              }
            >
              Prepare {mission.toLowerCase()}
            </Menu.LinkItem>
          ),
        )}
    </>
  )
  return (
    <ContextMenu.Root
      onOpenChange={(open) => {
        setFeedback('')
        if (open) handingOff.current = false
      }}
    >
      <ContextMenu.Trigger
        render={<span />}
        data-coordinate=""
        className={`${styles.coordinate} ${className ?? ''}`}
      >
        {compact ? (
          <Menu.Root
            onOpenChange={(open) => {
              setFeedback('')
              if (open) handingOff.current = false
            }}
          >
            <Menu.Trigger
              ref={trigger}
              render={<Button variant="ghost" padding="compact" />}
              className={styles.value}
              aria-label={`Location actions for ${text}`}
              title="Coordinates · copy, share or navigate"
            >
              {children ?? <span className={styles.address}>{text}</span>}
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Positioner className={styles.positioner} sideOffset={4}>
                <Menu.Popup
                  finalFocus={() => !handingOff.current}
                  className={styles.menu}
                >
                  {items()}
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          </Menu.Root>
        ) : navigable ? (
          <Link
            {...galaxyTarget(context.universeName, body, {
              ...location,
              ...(target !== 'planet' ? { target } : {}),
            })}
            resetScroll={false}
            className={`${styles.value} ${className ?? ''}`}
            aria-label={`View ${label ? `${label} ` : ''}${text} in galaxy`}
          >
            {children ?? <span className={styles.address}>{text}</span>}
          </Link>
        ) : (
          <span className={styles.value}>
            {children ?? <span className={styles.address}>{text}</span>}
          </span>
        )}
        {!compact && (
          <span className={styles.tools}>
            <Button
              variant="ghost"
              size="icon"
              padding="compact"
              type="button"
              onClick={() => void copy(false)}
              aria-label={`Copy coordinates ${text}`}
              title={feedback || 'Copy coordinates'}
            >
              {feedback.startsWith('Coordinates copied') ? (
                <Check size={14} />
              ) : (
                <Copy size={14} />
              )}
            </Button>
            <Menu.Root
              onOpenChange={(open) => {
                setFeedback('')
                if (open) handingOff.current = false
              }}
            >
              <Menu.Trigger
                ref={trigger}
                render={
                  <Button variant="ghost" size="icon" padding="compact" />
                }
                aria-label={`Location actions for ${text}`}
                title="Location actions"
              >
                <Ellipsis size={16} />
              </Menu.Trigger>
              <Menu.Portal>
                <Menu.Positioner className={styles.positioner} sideOffset={4}>
                  <Menu.Popup
                    finalFocus={() => !handingOff.current}
                    className={styles.menu}
                  >
                    {items()}
                  </Menu.Popup>
                </Menu.Positioner>
              </Menu.Portal>
            </Menu.Root>
          </span>
        )}
        <span
          role={feedback ? 'status' : undefined}
          aria-live="polite"
          className={feedback ? styles.feedback : styles.status}
        >
          {feedback}
        </span>
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Positioner className={styles.positioner}>
          <ContextMenu.Popup
            finalFocus={() => !handingOff.current}
            className={styles.menu}
          >
            {items()}
          </ContextMenu.Popup>
        </ContextMenu.Positioner>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  )
}
