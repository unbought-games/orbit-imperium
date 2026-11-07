import {
  Suspense,
  useRef,
  useState,
  type ComponentPropsWithRef,
  type ReactNode,
} from 'react'
import {
  arrow as arrowMiddleware,
  autoUpdate,
  flip,
  offset,
  shift,
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

type Trigger = (
  props?: ComponentPropsWithRef<'button'>,
  speaking?: boolean,
) => ReactNode

/**
 * Lowest-priority orb bubble. It opens by itself for a new curated release and
 * waits while Command uplink or a tutorial tip owns the orb.
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
  const { announcement, acknowledge } = useReleaseAnnouncement(account)
  const [hidden, setHidden] = useState(false)
  const open = !!announcement && !hidden && !suspended
  const arrow = useRef<SVGSVGElement>(null)
  const floating = useFloating({
    open,
    onOpenChange: (next) => setHidden(!next),
    placement: 'top-end',
    strategy: 'fixed',
    middleware: [
      offset(16),
      flip(),
      shift({ padding: 12 }),
      arrowMiddleware({ element: arrow }),
    ],
    whileElementsMounted: autoUpdate,
  })
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
                'aria-label': `${open ? 'Hide' : 'Show'} what's new`,
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
              />
              <span className={styles.label}>
                <Sparkles size={16} aria-hidden="true" /> Now available
              </span>
              <h2>{announcement.title}</h2>
              <div className={styles.body}>
                <Suspense fallback={null}>
                  <announcement.Content />
                </Suspense>
              </div>
              <div className={styles.actions}>
                {announcement.href ? (
                  <a
                    className={classes(linkStyles.link, styles.read)}
                    href={announcement.href}
                    target="_blank"
                    rel="noopener"
                    onClick={acknowledge}
                  >
                    Read the update{' '}
                    <ArrowUpRight size={16} aria-hidden="true" />
                  </a>
                ) : (
                  <span />
                )}
                <Button variant="secondary" size="small" onClick={acknowledge}>
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
