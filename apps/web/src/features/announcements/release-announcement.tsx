import { useGameSession } from '../../shell/session-context'
import { Suspense, lazy, useRef } from 'react'
import { AdvisorBubble, type BubbleTrigger } from '../../ui/advisor-bubble'
import { ArrowUpRight, Sparkles } from 'lucide-react'
import { Button } from '../../ui/button'
import { classes } from '../../ui/classes'
import linkStyles from '../../ui/link.module.css'
import { useReleaseAnnouncement } from './use-release-announcement'
import styles from './release-announcement.module.css'

const AnnouncementBody = lazy(() => import('./announcement-body'))

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
  children: BubbleTrigger
}) {
  const { view } = useGameSession()
  const { announcement, acknowledge } = useReleaseAnnouncement(
    account,
    view.protocol === 4 ? (view.joined_at_ms ?? undefined) : undefined,
  )
  const open = !!announcement && !suspended
  const triggerRef = useRef<HTMLButtonElement>(null)
  const close = () => {
    // The bubble unmounts with focus inside it. Return focus to the orb.
    const trigger = triggerRef.current
    if (trigger instanceof HTMLElement) trigger.focus({ preventScroll: true })
    acknowledge()
  }
  return (
    <AdvisorBubble
      open={open}
      active={open}
      onOpenChange={(next) => {
        if (!next) close()
      }}
      trigger={children}
      triggerRef={triggerRef}
      triggerLabel={`Hide announcement: ${announcement?.title ?? ''}`}
      label={announcement?.title ?? ''}
      className={styles.bubble}
      data-testid="release-announcement"
    >
      {announcement && (
        <>
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
                Read the update <ArrowUpRight size={16} aria-hidden="true" />
              </a>
            ) : (
              <span />
            )}
            <Button variant="secondary" size="small" onClick={close}>
              Got it
            </Button>
          </div>
        </>
      )}
    </AdvisorBubble>
  )
}
