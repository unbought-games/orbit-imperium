import { useState, type CSSProperties } from 'react'
import {
  Atom,
  Check,
  ChevronRight,
  Crosshair,
  Hammer,
  Mail,
  Orbit,
  Radar,
  Rocket,
  Shield,
  Swords,
  Telescope,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useReducedMotion } from '../../ui/use-reduced-motion'
import { useToastSwipe } from '../../ui/use-toast-swipe'
import { ResourceSummary } from '../../ui/number-value'
import {
  occupiedFleetSlots,
  currentServerTime,
} from '../../client-model/game-projection'
import { arrivalCountdown, exactTime } from '../mission-presentation'
import {
  hasUnreadIntelligence,
  unreadBadgeCount,
  noticeContent,
  orbAppearance,
  type HudIcon,
  type HudNotice,
} from './model'
import type { CommandHudState } from './use-command-hud'
import styles from './hud.module.css'
const icons = {
  spy: Radar,
  fleet: Rocket,
  building: Hammer,
  research: Atom,
  shipyard: Rocket,
  defense: Shield,
  report: Telescope,
  message: Mail,
  attack: Swords,
  scan: Crosshair,
}
export function HudIconMark({
  kind,
  size = 20,
}: {
  kind: HudIcon
  size?: number
}) {
  const Icon = icons[kind]
  return <Icon size={size} aria-hidden="true" />
}
export function HudToast({
  notice,
  hud,
}: {
  notice: HudNotice
  hud: CommandHudState
}) {
  const swipe = useToastSwipe(() => hud.dismiss(notice))
  const content = noticeContent(hud.state, notice)
  if (!content) return null
  const used = occupiedFleetSlots(hud.state)
  const total =
    hud.state.view?.protocol === 4 ? hud.state.view.missions.fleet_slots : '0'
  const free = BigInt(total) > BigInt(used) ? BigInt(total) - BigInt(used) : 0n
  return (
    <motion.div
      className={styles.toastSwipe}
      data-testid="swipeable-toast"
      drag="x"
      dragMomentum={false}
      dragSnapToOrigin={false}
      style={{ x: swipe.x, opacity: swipe.opacity }}
      {...swipe.dragProps}
    >
      <button
        type="button"
        className={styles.toast}
        data-tone={content.tone}
        onClick={() => {
          if (swipe.canOpen()) hud.select(notice)
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
                {arrivalCountdown(
                  content.deadline,
                  currentServerTime(hud.state),
                )}
              </time>
            </span>
          )}
          {notice.kind === 'command' &&
            (content.icon === 'fleet' || content.icon === 'spy') && (
              <span className={styles.toastDetail}>
                {free.toString()} fleet slots available
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
function OrbSymbol({ kind }: { kind: HudIcon | null }) {
  const reduced = useReducedMotion()
  const icon = kind ? (
    <HudIconMark kind={kind} size={28} />
  ) : (
    <Orbit size={30} strokeWidth={1.25} />
  )
  if (reduced)
    return (
      <span
        className={styles.orbSymbol}
        data-orb-symbol={kind ?? 'idle'}
        aria-hidden="true"
      >
        {icon}
      </span>
    )
  return (
    <AnimatePresence initial={false} mode="sync">
      <motion.span
        key={kind ?? 'idle'}
        className={styles.orbSymbol}
        data-orb-symbol={kind ?? 'idle'}
        aria-hidden="true"
        initial={{ opacity: 0, scale: 0.82, filter: 'blur(3px)' }}
        animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
        exit={{ opacity: 0, scale: 0.82, filter: 'blur(3px)' }}
        transition={{ duration: 0.45, ease: [0.4, 0, 0.2, 1] }}
      >
        {icon}
      </motion.span>
    </AnimatePresence>
  )
}

export function CommandOrb({ hud }: { hud: CommandHudState }) {
  const [pressed, setPressed] = useState(false)
  const appearance = orbAppearance(hud.state, hud.recent)
  const caption = hud.caption
  const unread = hasUnreadIntelligence(hud.state)
  const unreadCount = unreadBadgeCount(hud.state)
  const used = occupiedFleetSlots(hud.state)
  const total =
    hud.state.view?.protocol === 4 ? hud.state.view.missions.fleet_slots : '0'
  return (
    <div
      className={styles.orbDock}
      data-tone={appearance.tone}
      data-pressed={pressed || undefined}
    >
      {caption && (
        <span
          key={caption.id}
          className={`${styles.orbCaption} ${styles.typedCaption}`}
          data-testid="orb-caption"
          data-category={caption.category}
          style={
            {
              '--caption-chars': caption.text.length,
              '--caption-width': `${caption.text.length}ch`,
              '--caption-typing': `${caption.typingMs}ms`,
              '--caption-life': `${caption.lifetimeMs}ms`,
            } as CSSProperties
          }
        >
          <span>{caption.text}</span>
        </span>
      )}
      <button
        type="button"
        className={styles.orb}
        data-testid="command-orb"
        data-tone={appearance.tone}
        aria-label={`${appearance.tone === 'red' ? 'Threat detected. ' : ''}${unreadCount ? `${unreadCount === 99 ? '99 or more' : unreadCount} unread items. ` : unread ? 'Unread intelligence. ' : ''}Open command HUD`}
        onPointerDown={() => setPressed(true)}
        onPointerUp={() => setPressed(false)}
        onPointerCancel={() => setPressed(false)}
        onPointerLeave={() => setPressed(false)}
        onLostPointerCapture={() => setPressed(false)}
        onBlur={() => setPressed(false)}
        onClick={() => {
          setPressed(false)
          hud.select('inbox')
        }}
      >
        <span className={styles.outerOrbit} />
        <span className={styles.innerOrbit} />
        <span className={styles.orbCore}>
          <span className={styles.coreShimmer} />
          <OrbSymbol kind={appearance.icon} />
        </span>
        <span
          className={styles.orbCharge}
          data-testid="orb-charge"
          aria-hidden="true"
        />
        {unreadCount > 0 && (
          <span
            className={styles.badge}
            data-testid="unread-count"
            aria-hidden="true"
          >
            {unreadCount}
          </span>
        )}
        {appearance.tone === 'green' && (
          <span className={styles.confirmed}>
            <Check size={12} />
          </span>
        )}
      </button>
      <span
        className={styles.slotBadge}
        aria-label={`Fleet slots: ${used} used of ${total}`}
      >
        <Rocket size={11} aria-hidden="true" />
        {used}
        <span>/ {total}</span>
      </span>
    </div>
  )
}
