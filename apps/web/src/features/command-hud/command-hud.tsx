import type { DispatchDraft } from '../missions'
import { useEffect, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { useLocation } from '@tanstack/react-router'
import { useGameSession } from '../../shell/session-context'
import { bindingKey } from '../../client-model/commands'
import { useCommandHud } from './use-command-hud'
import { CommandOrb, HudToast } from './hud-controls'
import { HudPanel } from './hud-panel'
import { noticeKey } from './model'
import styles from './hud.module.css'
const mobileQuery = '(max-width: 767px)'
function subscribeMobile(onChange: () => void) {
  const query = window.matchMedia(mobileQuery)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}
type HudProps = {
  body?: string
  onDraft: (draft: DispatchDraft) => void
}
export function CommandHud({ body, onDraft }: HudProps) {
  const { view } = useGameSession()
  const mobile = useSyncExternalStore(
    subscribeMobile,
    () => window.matchMedia(mobileQuery).matches,
    () => false,
  )
  return mobile && view.protocol === 4 ? (
    <LiveCommandHud
      key={bindingKey(view.binding)}
      body={body}
      onDraft={onDraft}
    />
  ) : null
}
function LiveCommandHud({ body, onDraft }: HudProps) {
  const { model, universeName } = useGameSession()
  const hud = useCommandHud(model)
  const href = useLocation({ select: (location) => location.href })
  useEffect(() => {
    hud.select(null)
  }, [href])
  return createPortal(
    <div className={styles.surface} data-command-hud>
      <div className={styles.hudLayer} aria-label="Live command HUD">
        <div
          className={styles.toasts}
          aria-label="Recent game events"
          aria-live="polite"
          aria-relevant="additions"
        >
          {hud.toasts.map((notice) => (
            <HudToast key={noticeKey(notice)} notice={notice} hud={hud} />
          ))}
        </div>
        <CommandOrb hud={hud} />
      </div>
      <HudPanel
        hud={hud}
        model={model}
        universe={universeName}
        body={body}
        onDraft={onDraft}
      />
    </div>,
    document.body,
  )
}
