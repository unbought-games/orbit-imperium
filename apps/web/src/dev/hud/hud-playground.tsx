import { useEffect, useRef } from 'react'
import { motion } from 'motion/react'
import { useToastSwipe } from '../../ui/use-toast-swipe'
import {
  Activity,
  ArrowRight,
  Atom,
  Check,
  ChevronRight,
  Crosshair,
  Hammer,
  Mail,
  Menu,
  Orbit,
  Radar,
  Radio,
  Rocket,
  RotateCcw,
  Shield,
  Smartphone,
  Sparkles,
  Swords,
  Telescope,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { ResourceValue } from '../../ui/resource-value'
import {
  countdown,
  eventCopy,
  fleetCapacity,
  flightArrival,
  isThreat,
} from './model'
import type { EventKind, HudEvent } from './model'
import { useDesktopPreview, useHud } from './use-hud'
import type { Hud } from './use-hud'
import styles from './hud.module.css'

const icons: Record<EventKind, LucideIcon> = {
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
const groups: { title: string; kinds: EventKind[] }[] = [
  { title: '01 / Flight control', kinds: ['spy', 'fleet'] },
  { title: '02 / Intelligence', kinds: ['report', 'message'] },
  {
    title: '03 / Planetary orders',
    kinds: ['building', 'research', 'shipyard', 'defense'],
  },
  { title: '04 / Threat detection', kinds: ['attack', 'scan'] },
]
function EventIcon({ kind, size = 20 }: { kind: EventKind; size?: number }) {
  const Icon = icons[kind]
  return <Icon size={size} aria-hidden="true" />
}
function Costs({ defense = false }: { defense?: boolean }) {
  return (
    <div className={styles.costs}>
      <ResourceValue resource="metal">
        {defense ? '40,000' : '30,000'}
      </ResourceValue>
      {!defense && <ResourceValue resource="crystal">10,000</ResourceValue>}
    </div>
  )
}
function Toast({ event, hud }: { event: HudEvent; hud: Hud }) {
  const swipe = useToastSwipe(() =>
    hud.dispatch({ type: 'dismiss-toast', id: event.id }),
  )
  const copy = eventCopy[event.kind]
  const flight =
    event.kind === 'spy' || event.kind === 'fleet' || isThreat(event)
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
        className={styles.toast}
        data-tone={copy.tone}
        onClick={() => {
          if (swipe.canOpen()) hud.dispatch({ type: 'open', id: event.id })
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            swipe.dismiss()
          }
        }}
      >
        <span className={styles.toastIcon}>
          <EventIcon kind={event.kind} />
        </span>
        <span className={styles.toastBody}>
          <span className={styles.toastTitle}>
            {copy.title}
            {copy.tone === 'green' && <Check size={14} />}
          </span>
          <span className={styles.toastDetail}>{copy.detail}</span>
          {flight && (
            <span className={styles.flightLine}>
              <span className={styles.trajectory}>
                <i />
              </span>
              <span>
                {hud.now >= flightArrival(event)
                  ? 'Arrived'
                  : `ETA ${countdown(flightArrival(event), Math.max(event.at, hud.now))}`}
              </span>
            </span>
          )}
          {event.kind === 'fleet' && (
            <span className={styles.toastDetail}>
              {fleetCapacity - hud.used} fleet slots available
            </span>
          )}
          {(event.kind === 'shipyard' || event.kind === 'defense') && (
            <Costs defense={event.kind === 'defense'} />
          )}
        </span>
        <ChevronRight size={13} className={styles.toastArrow} />
      </button>
    </motion.div>
  )
}
function Orb({ hud }: { hud: Hud }) {
  const kind = hud.threats.length
    ? hud.threats.at(-1)!.kind
    : hud.feedback
      ? hud.feedback.kind
      : hud.unread.length
        ? 'message'
        : null
  return (
    <div className={styles.orbDock} data-tone={hud.tone}>
      <span className={styles.orbCaption}>
        {hud.tone === 'red'
          ? 'THREAT DETECTED'
          : hud.tone === 'green'
            ? 'ORDER CONFIRMED'
            : hud.unread.length
              ? 'NEW INTELLIGENCE'
              : 'SYSTEMS ONLINE'}
      </span>
      <button
        className={styles.orb}
        data-testid="hud-orb"
        data-tone={hud.tone}
        aria-label={
          hud.threats.length
            ? `${hud.threats.length} threats. Open command HUD`
            : hud.unread.length
              ? `${hud.unread.length} unread messages. Open command HUD`
              : 'Open command HUD'
        }
        onClick={() =>
          hud.dispatch({ type: 'open', id: hud.threats.at(-1)?.id ?? 'inbox' })
        }
      >
        <span className={styles.outerOrbit} />
        <span className={styles.innerOrbit} />
        <span className={styles.orbCore}>
          <span className={styles.coreShimmer} />
          {kind ? (
            <EventIcon kind={kind} size={28} />
          ) : (
            <Orbit size={30} strokeWidth={1.25} />
          )}
        </span>
        {hud.unread.length > 0 && (
          <span className={styles.badge}>{hud.unread.length}</span>
        )}
        {hud.tone === 'green' && (
          <span className={styles.confirmed}>
            <Check size={12} />
          </span>
        )}
      </button>
      <span className={styles.slotBadge}>
        <Rocket size={11} />
        {hud.used}
        <span>/ {fleetCapacity}</span>
      </span>
    </div>
  )
}
function ReportContent() {
  return (
    <>
      <div className={styles.target}>
        <img src="/art/atlas/planet-07-320.webp" alt="" />
        <div>
          <span className={styles.eyebrow}>TARGET IDENTIFIED</span>
          <h3>Nereid</h3>
          <span>[1:42:9] · Commander Voss</span>
        </div>
        <span className={styles.tag}>SCANNED</span>
      </div>
      <div className={styles.reportSection}>
        <span className={styles.eyebrow}>RESOURCES DETECTED</span>
        <div className={styles.resourceGrid}>
          <div>
            <ResourceValue resource="metal">842,500</ResourceValue>
            <small>Metal</small>
          </div>
          <div>
            <ResourceValue resource="crystal">316,200</ResourceValue>
            <small>Crystal</small>
          </div>
          <div>
            <ResourceValue resource="deuterium">94,800</ResourceValue>
            <small>Deuterium</small>
          </div>
        </div>
      </div>
      <div className={styles.reportSection}>
        <span className={styles.eyebrow}>ORBITAL SIGNATURES</span>
        <div className={styles.reportRow}>
          <span>Large Cargo</span>
          <strong>24</strong>
        </div>
        <div className={styles.reportRow}>
          <span>Light Fighter</span>
          <strong>60</strong>
        </div>
        <div className={styles.reportRow}>
          <span>Cruiser</span>
          <strong>8</strong>
        </div>
      </div>
      <div className={styles.intelNote}>
        <Shield size={17} />
        <span>Probe recovered. Your fleet remains undetected.</span>
      </div>
    </>
  )
}
function HudDialog({ hud }: { hud: Hud }) {
  const ref = useRef<HTMLDialogElement>(null)
  const open = hud.state.selectedId !== null
  const selected = hud.state.events.find(
    (event) => event.id === hud.state.selectedId,
  )
  useEffect(() => {
    if (open && !ref.current?.open) ref.current?.showModal()
    else if (!open && ref.current?.open) ref.current?.close()
  }, [open])
  const threat = selected && isThreat(selected)
  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      data-tone={threat ? 'red' : 'champagne'}
      aria-labelledby="hud-title"
      onCancel={() => hud.dispatch({ type: 'close' })}
      onClose={() => hud.dispatch({ type: 'close' })}
      onClick={(event) => {
        if (event.target === event.currentTarget)
          hud.dispatch({ type: 'close' })
      }}
    >
      <div className={styles.dialogInterior}>
        <header className={styles.dialogHeader}>
          <span className={styles.eyebrow}>
            <Radio size={12} />{' '}
            {threat ? 'EARLY WARNING NETWORK' : 'SECURE TRANSMISSION'}
          </span>
          <button
            aria-label="Close HUD"
            onClick={() => hud.dispatch({ type: 'close' })}
          >
            <X size={20} />
          </button>
        </header>
        <h2 id="hud-title">
          {selected ? eventCopy[selected.kind].title : 'Command uplink'}
        </h2>
        <div className={styles.signal}>
          <span />
          <span />
          <span />
          <span />
          <span />
          LIVE CONNECTION <i /> ASTER
        </div>
        {!selected ? (
          <>
            <p className={styles.dialogIntro}>Your empire, at a glance.</p>
            <div className={styles.reportRow}>
              <span>Fleet channels in use</span>
              <strong>
                {hud.used} / {fleetCapacity}
              </strong>
            </div>
            <div className={styles.inbox}>
              {[...hud.state.events]
                .reverse()
                .filter(
                  (event) =>
                    event.kind === 'report' || event.kind === 'message',
                )
                .map((event) => (
                  <button
                    key={event.id}
                    onClick={() => hud.dispatch({ type: 'open', id: event.id })}
                  >
                    <EventIcon kind={event.kind} />
                    <span>
                      <strong>{eventCopy[event.kind].title}</strong>
                      <small>
                        {event.kind === 'report'
                          ? 'Nereid · [1:42:9]'
                          : 'Commander Lyra · Alliance'}
                      </small>
                    </span>
                    <ChevronRight size={16} />
                  </button>
                ))}
              {!hud.state.events.some(
                (event) => event.kind === 'report' || event.kind === 'message',
              ) && <p>No new intelligence. All channels clear.</p>}
            </div>
          </>
        ) : selected.kind === 'report' ? (
          <ReportContent />
        ) : selected.kind === 'message' ? (
          <div className={styles.message}>
            <div className={styles.sender}>
              <span>LY</span>
              <div>
                <strong>Commander Lyra</strong>
                <small>ANDROMEDA ALLIANCE</small>
              </div>
            </div>
            <p>
              The outer colonies are quiet. Our scouts found an unguarded
              resource cache in sector 42.
            </p>
            <p>
              Keep a fleet slot open. I’ll send coordinates when the next scan
              comes through.
            </p>
            <span className={styles.signature}>Fly safe, Commander.</span>
          </div>
        ) : threat ? (
          <>
            <div className={styles.threatVisual}>
              <Crosshair size={64} strokeWidth={1} />
              <span>ASTER · [1:42:8]</span>
              <strong>
                {hud.now >= flightArrival(selected)
                  ? 'CONTACT REACHED'
                  : countdown(flightArrival(selected), hud.now)}
              </strong>
              <small>
                {hud.now >= flightArrival(selected)
                  ? 'Review your defenses'
                  : 'UNTIL CONTACT'}
              </small>
            </div>
            <div className={styles.reportRow}>
              <span>Hostile signature</span>
              <strong>
                {selected.kind === 'attack'
                  ? '18 combat ships'
                  : '3 espionage probes'}
              </strong>
            </div>
            <div className={styles.reportRow}>
              <span>Origin</span>
              <strong>[1:43:2]</strong>
            </div>
            <p className={styles.dialogIntro}>
              Your command network is tracking this approach.
            </p>
            <button
              className={styles.primaryAction}
              onClick={() => hud.dispatch({ type: 'acknowledge' })}
            >
              <Check size={16} /> Acknowledge threats
            </button>
          </>
        ) : (
          <>
            <div className={styles.orderConfirmed}>
              <EventIcon kind={selected.kind} size={42} />
              <h3>{eventCopy[selected.kind].detail}</h3>
              <p>
                {selected.kind === 'spy' || selected.kind === 'fleet'
                  ? `${hud.used} of ${fleetCapacity} fleet slots used · ETA ${countdown(flightArrival(selected), hud.now)}`
                  : 'Order registered. Your empire is moving.'}
              </p>
            </div>
            {(selected.kind === 'shipyard' || selected.kind === 'defense') && (
              <Costs defense={selected.kind === 'defense'} />
            )}
          </>
        )}
        <footer className={styles.dialogFooter}>
          <span>ORBIT / COMMAND NETWORK</span>
          <span>
            ENCRYPTED <Shield size={10} />
          </span>
        </footer>
      </div>
    </dialog>
  )
}
export function HudPlayground() {
  const hud = useHud()
  const desktop = useDesktopPreview()
  return (
    <div className={styles.playground}>
      <div className={styles.desktopNotice}>
        <div className={styles.desktopCopy}>
          <Smartphone size={38} strokeWidth={1} />
          <span className={styles.eyebrow}>ORBIT IMPERIUM / EXPERIMENT 01</span>
          <h1>
            A little universe.
            <br />
            At your fingertips.
          </h1>
          <p>
            Your empire has a pulse. Send a probe, intercept a transmission, or
            sound the alarm. Try every event in the live mobile preview.
          </p>
          <code>/hud-playground</code>
          <div className={styles.desktopLegend}>
            <span>Ice · Online</span>
            <span>Champagne · Intelligence</span>
            <span>Green · Confirmed</span>
            <span>Red · Hostile</span>
          </div>
        </div>
        {desktop && (
          <iframe
            className={styles.phonePreview}
            title="Live mobile HUD prototype"
            src="/hud-playground"
            width="390"
            height="844"
          />
        )}
      </div>
      <div className={styles.mobile}>
        <header className={styles.topBar}>
          <span>
            <Orbit size={22} />
            <strong>ORBIT</strong>
            <small>IMPERIUM</small>
          </span>
          <span className={styles.connected}>
            <i /> ANDROMEDA
          </span>
        </header>
        <main className={styles.main}>
          <section className={styles.planetHero}>
            <img
              src="/art/atlas/planet-07-640.webp"
              alt="Aster, a blue ocean planet"
            />
            <span className={styles.heroGrid} />
            <div className={styles.heroText}>
              <span className={styles.eyebrow}>COMMANDER’S OVERVIEW</span>
              <h1>
                Aster<span>[1:42:8]</span>
              </h1>
              <p>Your empire never stands still.</p>
              <span className={styles.online}>
                <i /> ALL SYSTEMS OPERATIONAL
              </span>
            </div>
          </section>
          <div className={styles.resources}>
            <ResourceValue resource="metal">1.24M</ResourceValue>
            <ResourceValue resource="crystal">842K</ResourceValue>
            <ResourceValue resource="deuterium">316K</ResourceValue>
          </div>
          <section
            className={styles.console}
            aria-label="Prototype event controls"
          >
            <header className={styles.consoleHeader}>
              <div>
                <span className={styles.eyebrow}>
                  INTERACTION LAB <span>01</span>
                </span>
                <h2>Bring it to life.</h2>
              </div>
              <Sparkles size={24} strokeWidth={1} />
            </header>
            <p>Tap an event. Watch your command orb respond.</p>
            {groups.map((group) => (
              <div className={styles.controlGroup} key={group.title}>
                <h3>{group.title}</h3>
                <div className={styles.controlGrid}>
                  {group.kinds.map((kind) => (
                    <button
                      key={kind}
                      data-tone={eventCopy[kind].tone}
                      disabled={
                        (kind === 'spy' || kind === 'fleet') &&
                        hud.used >= fleetCapacity
                      }
                      onClick={() =>
                        hud.dispatch({ type: 'trigger', kind, now: Date.now() })
                      }
                    >
                      <EventIcon kind={kind} size={17} />
                      <span>{eventCopy[kind].label}</span>
                      <ArrowRight size={12} />
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <div className={styles.utility}>
              <button
                onClick={() =>
                  hud.dispatch({ type: 'reset', now: Date.now(), unread: true })
                }
              >
                <Mail size={14} /> Simulate sign-in
              </button>
              <button
                onClick={() => hud.dispatch({ type: 'reset', now: Date.now() })}
              >
                <RotateCcw size={13} /> Reset
              </button>
            </div>
            <p className={styles.footnote}>SIMULATED EVENTS · NO LIVE ORDERS</p>
          </section>
        </main>
        <div className={styles.hudLayer} aria-label="Live command HUD">
          <div className={styles.toasts} aria-label="Recent events">
            {hud.toasts.map((event) => (
              <Toast key={event.id} event={event} hud={hud} />
            ))}
          </div>
          <Orb hud={hud} />
        </div>
        <div className={styles.srOnly} role="status" aria-live="polite">
          {hud.state.events.at(-1) &&
            eventCopy[hud.state.events.at(-1)!.kind].title}{' '}
          · {hud.used} of {fleetCapacity} fleet slots used
        </div>
        <nav className={styles.nav} aria-label="Prototype global menu">
          {[
            { icon: Orbit, title: 'Empire' },
            { icon: Telescope, title: 'Galaxy' },
            { icon: Rocket, title: 'Fleets' },
            { icon: Activity, title: 'Reports' },
            { icon: Menu, title: 'Menu' },
          ].map(({ icon: Icon, title }) => (
            <button
              key={title}
              aria-label={`${title} preview`}
              className={title === 'Empire' ? styles.navActive : ''}
              onClick={() => hud.dispatch({ type: 'open', id: 'inbox' })}
            >
              <Icon size={21} strokeWidth={1.5} />
              <span>{title}</span>
            </button>
          ))}
        </nav>
        <HudDialog hud={hud} />
      </div>
    </div>
  )
}
