import { useState, type ReactNode } from 'react'
import { createGameStore } from '../../src/client-model/game-store'
import { AnnouncementBubble } from '../../src/features/announcements/release-announcement'
import { CommandOrb } from '../../src/features/command-hud/hud-controls'
import {
  captionTiming,
  type Caption,
} from '../../src/features/command-hud/caption-engine'
import styles from '../../src/features/command-hud/hud.module.css'
import { longAnnouncement } from '../fixtures/editorial'

const idle = {
  state: createGameStore().getInitialState(),
  recent: [],
  selection: null,
  select: () => {},
}

function OrbLayer({ children }: { children: ReactNode }) {
  // A scrollable document makes unintended wheel chaining observable.
  return (
    <main style={{ minHeight: '200vh' }} className={styles.surface}>
      <div className={styles.hudLayer}>{children}</div>
    </main>
  )
}

export function AnnouncementScene() {
  const [seen, setSeen] = useState(false)
  return (
    <OrbLayer>
      <AnnouncementBubble
        announcement={seen ? null : longAnnouncement}
        acknowledge={() => setSeen(true)}
      >
        {(triggerProps) => (
          <CommandOrb
            hud={{ ...idle, caption: null }}
            triggerProps={triggerProps}
          />
        )}
      </AnnouncementBubble>
    </OrbLayer>
  )
}

function PreparedCaption({
  text,
  category,
}: Pick<Caption, 'text' | 'category'>) {
  const caption = { id: 1, category, text, ...captionTiming(text) }
  return (
    <OrbLayer>
      <CommandOrb hud={{ ...idle, caption }} />
    </OrbLayer>
  )
}

export function RefreshCaptionScene() {
  return <PreparedCaption text="Welcome back, {address}." category="updated" />
}

export function PersonalityCaptionScene() {
  return (
    <PreparedCaption
      text="Good thing we sent the bad one."
      category="personality"
    />
  )
}
