import { useEffect, useState } from 'react'
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
import { motion } from 'motion/react'
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
export function CommandOrb({ hud }: { hud: CommandHudState }) {
  const [starting, setStarting] = useState(true)
  useEffect(() => {
    const timer = window.setTimeout(() => setStarting(false), 5500)
    return () => window.clearTimeout(timer)
  }, [])
  const appearance = orbAppearance(hud.state, hud.recent)
  const idle = appearance.caption === 'SYSTEMS ONLINE'
  const unread = hasUnreadIntelligence(hud.state)
  const unreadCount = unreadBadgeCount(hud.state)
  const used = occupiedFleetSlots(hud.state)
  const total =
    hud.state.view?.protocol === 4 ? hud.state.view.missions.fleet_slots : '0'
  return (
    <div className={styles.orbDock} data-tone={appearance.tone}>
      {(!idle || starting) && (
        <span
          className={`${styles.orbCaption} ${idle ? styles.startupCaption : ''}`}
          data-testid="orb-caption"
        >
          {idle ? <span>Systems Online</span> : appearance.caption}
        </span>
      )}
      <button
        type="button"
        className={styles.orb}
        data-testid="command-orb"
        data-tone={appearance.tone}
        aria-label={`${appearance.tone === 'red' ? 'Threat detected. ' : ''}${unreadCount ? `${unreadCount === 99 ? '99 or more' : unreadCount} unread items. ` : unread ? 'Unread intelligence. ' : ''}Open command HUD`}
        onClick={() => hud.select('inbox')}
      >
        <span className={styles.outerOrbit} />
        <span className={styles.innerOrbit} />
        <span className={styles.orbCore}>
          <span className={styles.coreShimmer} />
          {appearance.icon ? (
            <HudIconMark kind={appearance.icon} size={28} />
          ) : (
            <Orbit size={30} strokeWidth={1.25} />
          )}
        </span>
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
