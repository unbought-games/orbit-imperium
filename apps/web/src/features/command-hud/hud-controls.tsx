import { addressCaption } from '../../client-model/empire-identity'
import {
  useState,
  type CSSProperties,
  type ComponentPropsWithRef,
  type ReactNode,
} from 'react'
import { Check, Orbit, Rocket } from 'lucide-react'
import { HudIconMark } from './hud-icon'
export { HudIconMark } from './hud-icon'
import { AnimatePresence, motion } from 'motion/react'
import { useReducedMotion } from '../../ui/use-reduced-motion'
import { occupiedFleetSlots } from '../../client-model/game-projection'
import {
  hasUnreadIntelligence,
  unreadBadgeCount,
  orbAppearance,
  type HudIcon,
} from './model'
import type { CommandHudState } from './use-command-hud'
import styles from './hud.module.css'
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

function OrbFace({ symbol }: { symbol: ReactNode }) {
  return (
    <>
      <span className={styles.outerOrbit} />
      <span className={styles.innerOrbit} />
      <span className={styles.orbCore}>
        <span className={styles.coreShimmer} />
        {symbol}
      </span>
    </>
  )
}

/** The idle orb as decoration, outside the command HUD. */
export function AmbientOrb({ className }: { className?: string }) {
  return (
    <span
      className={`${styles.surface} ${styles.ambient} ${className ?? ''}`}
      aria-hidden="true"
    >
      <span className={styles.orb}>
        <OrbFace symbol={<OrbSymbol kind={null} />} />
      </span>
    </span>
  )
}

export function CommandOrb({
  hud,
  address = 'Commander',
  triggerProps,
  showCaption = true,
}: {
  hud: CommandHudState
  address?: string
  triggerProps?: ComponentPropsWithRef<'button'>
  showCaption?: boolean
}) {
  const [pressed, setPressed] = useState(false)
  const appearance = orbAppearance(hud.state, hud.recent)
  const caption = hud.caption
  const captionText = caption ? addressCaption(caption.text, address) : ''
  const unread = hasUnreadIntelligence(hud.state)
  const unreadCount = unreadBadgeCount(hud.state)
  const used = occupiedFleetSlots(hud.state)
  const total =
    hud.state.view?.protocol === 4 ? hud.state.view.missions.fleet_slots : '0'
  return (
    <div
      className={styles.orbDock}
      data-touch-control=""
      data-tone={appearance.tone}
      data-pressed={pressed || undefined}
    >
      <span
        className={styles.refreshAnnouncement}
        role="status"
        aria-atomic="true"
      >
        {caption?.category === 'updated' ? captionText : ''}
      </span>
      {caption && showCaption && (
        <span
          key={caption.id}
          className={`${styles.orbCaption} ${styles.typedCaption}`}
          data-testid="orb-caption"
          data-category={caption.category}
          style={
            {
              '--caption-chars': captionText.length,
              '--caption-width': `${captionText.length}ch`,
              '--caption-typing': `${caption.typingMs}ms`,
              '--caption-life': `${caption.lifetimeMs}ms`,
            } as CSSProperties
          }
        >
          <span>{captionText}</span>
        </span>
      )}
      <button
        type="button"
        className={styles.orb}
        data-testid="command-orb"
        data-tone={appearance.tone}
        data-updated={caption?.category === 'updated' || undefined}
        aria-haspopup="dialog"
        aria-expanded={hud.selection !== null}
        aria-label={`${appearance.tone === 'red' ? 'Threat detected. ' : ''}${unreadCount ? `${unreadCount === 99 ? '99 or more' : unreadCount} unread items. ` : unread ? 'Unread intelligence. ' : ''}Open command HUD`}
        {...triggerProps}
        onPointerDown={() => setPressed(true)}
        onPointerUp={() => setPressed(false)}
        onPointerCancel={() => setPressed(false)}
        onPointerLeave={() => setPressed(false)}
        onLostPointerCapture={() => setPressed(false)}
        onBlur={() => setPressed(false)}
        onClick={(event) => {
          setPressed(false)
          if (triggerProps?.onClick) triggerProps.onClick(event)
          else hud.select('inbox')
        }}
      >
        {caption?.category === 'updated' && (
          <span
            key={caption.id}
            className={styles.refreshPulse}
            data-testid="orb-refresh-pulse"
            aria-hidden="true"
          >
            <span />
            <span />
          </span>
        )}
        <OrbFace symbol={<OrbSymbol kind={appearance.icon} />} />
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
