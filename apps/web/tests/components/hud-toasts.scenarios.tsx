import { useRef, useState } from 'react'
import { HudToasts } from '../../src/features/command-hud/hud-toasts'
import type { HudToastView } from '../../src/features/command-hud/notification-history'
import { noticeKey, type HudTarget } from '../../src/features/command-hud/model'
import styles from '../../src/features/command-hud/hud.module.css'

// Prepared presentation inputs; no coordinator, command setup or expiry clock.
const notices: HudToastView[] = [
  {
    target: { kind: 'command', id: 'build' },
    content: {
      title: 'Construction started',
      detail: 'Metal Mine → level 2 · 1m',
      tone: 'green',
      icon: 'building',
    },
    now: 0,
    freeFleetSlots: null,
  },
  {
    target: { kind: 'report', id: 'report' },
    content: {
      title: 'Espionage report',
      detail: '[1:2:3]',
      tone: 'champagne',
      icon: 'report',
    },
    now: 0,
    freeFleetSlots: null,
  },
  {
    target: { kind: 'conversation', id: 'message' },
    content: {
      title: 'Message received',
      detail: 'Nova · Tap to read',
      tone: 'champagne',
      icon: 'message',
    },
    now: 0,
    freeFleetSlots: null,
  },
]
type Event = { kind: 'open' | 'dismiss'; key: string } | { kind: 'fallback' }

export function HudToastsScenario() {
  const fallback = useRef<HTMLButtonElement>(null)
  const [events, setEvents] = useState<Event[]>([])
  const keys = (kind: 'open' | 'dismiss') =>
    events.flatMap((event) =>
      event.kind !== 'fallback' && event.kind === kind ? [event.key] : [],
    )
  const record = (kind: 'open' | 'dismiss', target: HudTarget) =>
    setEvents((old) => [...old, { kind, key: noticeKey(target) }])
  const dismissed = keys('dismiss')
  return (
    <>
      <main style={{ padding: 24 }}>
        <h1>Prepared command notifications</h1>
        <button type="button" ref={fallback}>
          Return to commands
        </button>
        <p>
          Opened:{' '}
          <output aria-label="Opened notices">
            {keys('open').join(', ') || 'none'}
          </output>
        </p>
        <p>
          Dismissed:{' '}
          <output aria-label="Dismissed notices">
            {dismissed.join(', ') || 'none'}
          </output>
        </p>
        <p>
          Focus returns:{' '}
          <output aria-label="Fallback calls">
            {events.filter((event) => event.kind === 'fallback').length}
          </output>
        </p>
      </main>
      <div className={styles.surface}>
        <div className={styles.hudLayer}>
          <HudToasts
            notices={notices.filter(
              (notice) => !dismissed.includes(noticeKey(notice.target)),
            )}
            onOpen={(target) => record('open', target)}
            onDismiss={(target) => record('dismiss', target)}
            focusFallback={() => {
              setEvents((old) => [...old, { kind: 'fallback' }])
              fallback.current?.focus({ preventScroll: true })
            }}
          />
        </div>
      </div>
      <button type="button" style={{ marginLeft: 24 }}>
        After notifications
      </button>
    </>
  )
}
