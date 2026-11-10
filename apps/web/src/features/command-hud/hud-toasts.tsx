import { useRef, useLayoutEffect, type CSSProperties } from 'react'
import { Check, ChevronRight } from 'lucide-react'
import { motion } from 'motion/react'
import { useToastSwipe } from '../../ui/use-toast-swipe'
import { ResourceSummary } from '../../ui/number-value'
import { arrivalCountdown, exactTime } from '../mission-presentation'
import { noticeKey, type HudTarget } from './model'
import type { HudToastView } from './notification-history'
import { HudIconMark } from './hud-icon'
import styles from './hud.module.css'

export type HudToastsProps = {
  notices: readonly HudToastView[]
  onOpen: (target: HudTarget) => void
  onDismiss: (target: HudTarget) => void
  focusFallback?: () => void
}
export function HudToasts({
  notices,
  onOpen,
  onDismiss,
  focusFallback,
}: HudToastsProps) {
  const container = useRef<HTMLDivElement>(null)
  const restoreFocus = useRef(false)
  const shownTop = useRef<string | null>(null)
  const topKey = notices[0] ? noticeKey(notices[0].target) : null
  useLayoutEffect(() => {
    shownTop.current = topKey
    if (restoreFocus.current) {
      const next = container.current?.querySelector<HTMLButtonElement>(
        '[data-toast-depth="0"] button',
      )
      if (next) next.focus({ preventScroll: true })
      else focusFallback?.()
      restoreFocus.current = false
    }
    return () => {
      restoreFocus.current ||= !!container.current?.contains(
        document.activeElement,
      )
    }
  }, [topKey])
  return (
    <div
      ref={container}
      className={styles.toasts}
      aria-label="Recent game events"
      aria-live="polite"
      aria-relevant="additions"
    >
      {notices.map((notice, depth) => (
        <div
          key={noticeKey(notice.target)}
          className={styles.toastStackItem}
          data-toast-depth={depth}
          inert={depth > 0}
          aria-hidden={depth > 0 || undefined}
          style={{ '--toast-depth': depth } as CSSProperties}
        >
          <HudToast
            notice={notice}
            onOpen={() => onOpen(notice.target)}
            active={depth === 0}
            onDismiss={() => {
              // Only removing the top card changes topKey and consumes the flag.
              if (noticeKey(notice.target) === shownTop.current)
                restoreFocus.current = !!container.current?.contains(
                  document.activeElement,
                )
              onDismiss(notice.target)
            }}
          />
        </div>
      ))}
    </div>
  )
}
function HudToast({
  notice,
  onOpen,
  active,
  onDismiss,
}: {
  notice: HudToastView
  onOpen: () => void
  active: boolean
  onDismiss: () => void
}) {
  const swipe = useToastSwipe(onDismiss)
  const { content, now, freeFleetSlots } = notice
  return (
    <motion.div
      className={styles.toastSwipe}
      data-testid="swipeable-toast"
      drag={active ? 'x' : false}
      dragMomentum={false}
      dragSnapToOrigin={false}
      style={{ x: swipe.x, opacity: swipe.opacity }}
      {...swipe.dragProps}
    >
      <button
        type="button"
        className={styles.toast}
        data-tone={content.tone}
        onClick={(event) => {
          if (swipe.canOpen(event.detail === 0 ? 'keyboard' : 'pointer'))
            onOpen()
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            swipe.dismiss()
          }
        }}
      >
        <span className={styles.toastIcon}>
          <HudIconMark kind={content.icon} />
        </span>
        <span className={styles.toastBody}>
          <span className={styles.toastTitle}>
            {content.title}
            {content.tone === 'green' && <Check size={14} />}
          </span>
          <span className={styles.toastDetail}>{content.detail}</span>
          {content.deadline !== undefined && (
            <span className={styles.flightLine}>
              <span className={styles.trajectory}>
                <i />
              </span>
              <time
                title={exactTime(content.deadline)}
                dateTime={new Date(content.deadline).toISOString()}
              >
                {arrivalCountdown(content.deadline, now)}
              </time>
            </span>
          )}
          {freeFleetSlots !== null && (
            <span className={styles.toastDetail}>
              {freeFleetSlots} fleet slots available
            </span>
          )}
          {content.costs && (
            <span className={styles.costs}>
              <ResourceSummary value={content.costs} />
            </span>
          )}
        </span>
        <ChevronRight size={13} className={styles.toastArrow} />
      </button>
    </motion.div>
  )
}
