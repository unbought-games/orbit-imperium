import { useGameSession } from '../../shell/session-context'
import {
  Suspense,
  lazy,
  useRef,
  useLayoutEffect,
  type ComponentPropsWithRef,
  type ReactNode,
} from 'react'
import {
  arrow as arrowMiddleware,
  autoUpdate,
  flip,
  offset,
  shift,
  size,
  useClick,
  useDismiss,
  useFloating,
  useInteractions,
  useRole,
  FloatingArrow,
  FloatingFocusManager,
  FloatingPortal,
} from '@floating-ui/react'
import { ArrowUpRight, Sparkles } from 'lucide-react'
import { Button } from '../../ui/button'
import { classes } from '../../ui/classes'
import linkStyles from '../../ui/link.module.css'
import { useReleaseAnnouncement } from './use-release-announcement'
import styles from './release-announcement.module.css'

const AnnouncementBody = lazy(() => import('./announcement-body'))

type Trigger = (
  props?: ComponentPropsWithRef<'button'>,
  speaking?: boolean,
) => ReactNode

/**
 * Lowest-priority orb bubble. It opens by itself for a curated announcement and
 * waits while the caller suspends it (threats, tutorial tips, Command uplink).
 * Any way of closing it counts as seen; afterwards the orb behaves normally.
 */
export function ReleaseAnnouncement({
  account,
  suspended,
  children,
}: {
  account: string
  suspended: boolean
  children: Trigger
}) {
  const { view } = useGameSession()
  const { announcement, acknowledge } = useReleaseAnnouncement(
    account,
    view.protocol === 4 ? (view.joined_at_ms ?? undefined) : undefined,
  )
  const open = !!announcement && !suspended
  const arrow = useRef<SVGSVGElement>(null)
  const close = () => {
    // The bubble unmounts with focus inside it. Return focus to the orb.
    const trigger = floating.refs.domReference.current
    if (trigger instanceof HTMLElement) trigger.focus({ preventScroll: true })
    acknowledge()
  }
  const floating = useFloating({
    open,
    onOpenChange: (next) => {
      if (!next) close()
    },
    placement: 'top-end',
    strategy: 'fixed',
    middleware: [
      offset(16),
      flip({ padding: 12 }),
      shift({ padding: 12 }),
      size({
        padding: 12,
        apply({ availableHeight, elements }) {
          elements.floating.style.maxHeight = `${Math.max(0, Math.floor(availableHeight))}px`
        },
      }),
      arrowMiddleware({ element: arrow }),
    ],
    whileElementsMounted: autoUpdate,
  })
  useLayoutEffect(() => {
    const bubble = floating.refs.floating.current
    const trigger = floating.refs.domReference.current
    return () => {
      // A runtime withdrawal/expiry can remove the focused bubble without a
      // dismissal click. Preserve keyboard position without recording it seen.
      if (
        bubble?.contains(document.activeElement) &&
        trigger instanceof HTMLElement
      )
        trigger.focus({ preventScroll: true })
    }
  }, [
    open,
    announcement?.id,
    floating.refs.floating,
    floating.refs.domReference,
  ])
  const interactions = useInteractions([
    useClick(floating.context),
    useDismiss(floating.context, { outsidePress: false }),
    useRole(floating.context, { role: 'dialog' }),
  ])
  return (
    <>
      {children(
        suspended || !announcement
          ? undefined
          : {
              ...interactions.getReferenceProps({
                'aria-label': `Hide announcement: ${announcement.title}`,
              }),
              ref: floating.refs.setReference,
            },
        open,
      )}
      {open && announcement && (
        <FloatingPortal>
          <FloatingFocusManager
            context={floating.context}
            modal={false}
            initialFocus={-1}
          >
            <div
              ref={floating.refs.setFloating}
              style={floating.floatingStyles}
              className={styles.bubble}
              data-testid="release-announcement"
              {...interactions.getFloatingProps({
                'aria-label': announcement.title,
              })}
            >
              <FloatingArrow
                ref={arrow}
                context={floating.context}
                fill="var(--surface-raised)"
                stroke="var(--border-accent)"
                strokeWidth={1}
              />
              <div
                className={styles.content}
                role="region"
                aria-label="Announcement content"
                tabIndex={0}
              >
                <span className={styles.label}>
                  <Sparkles size={16} aria-hidden="true" /> Now available
                </span>
                <h2>{announcement.title}</h2>
                <div className={styles.body}>
                  <Suspense fallback={null}>
                    <AnnouncementBody announcement={announcement} />
                  </Suspense>
                </div>
              </div>
              <div className={styles.actions}>
                {announcement.href ? (
                  <a
                    className={classes(linkStyles.link, styles.read)}
                    href={announcement.href}
                    target="_blank"
                    rel="noopener"
                    onClick={close}
                  >
                    Read the update{' '}
                    <ArrowUpRight size={16} aria-hidden="true" />
                  </a>
                ) : (
                  <span />
                )}
                <Button variant="secondary" size="small" onClick={close}>
                  Got it
                </Button>
              </div>
            </div>
          </FloatingFocusManager>
        </FloatingPortal>
      )}
    </>
  )
}
