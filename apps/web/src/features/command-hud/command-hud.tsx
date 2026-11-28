import { usePlayerIdentity } from '../../shell/player-profiles-context'
import { useIdentityTitle } from '../../client-model/use-identity-title'
import { TutorialAdvisor } from '../tutorial/advisor'
import { BriefingLink } from '../tutorial/briefing-link'
import { ReleaseAnnouncement } from '../announcements/release-announcement'
import type { DispatchDraft } from '../missions'
import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from '@tanstack/react-router'
import { useGameSession } from '../../shell/session-context'
import { bindingKey } from '../../client-model/commands'
import { useCommandHud } from './use-command-hud'
import { CommandOrb } from './hud-controls'
import { HudToasts } from './hud-toasts'
import { hudToastViews } from './notification-history'
import { HudPanel } from './hud-panel'
import { routeTarget } from '../../shell/route-target'
import { incomingThreats } from './model'
import styles from './hud.module.css'
type HudProps = {
  body?: string
  onDraft: (draft: DispatchDraft) => void
}
export function CommandHud({ body, onDraft }: HudProps) {
  const { view } = useGameSession()
  return view.protocol === 4 ? (
    <LiveCommandHud
      key={bindingKey(view.binding)}
      body={body}
      onDraft={onDraft}
    />
  ) : null
}
function LiveCommandHud({ body, onDraft }: HudProps) {
  const { model, universeName, view } = useGameSession()
  const identity = usePlayerIdentity(view.binding.player)
  const title = useIdentityTitle(identity?.title)
  const hud = useCommandHud(model)
  const navigate = useNavigate()
  const layer = useRef<HTMLDivElement>(null)
  const href = useLocation({ select: (location) => location.href })
  useEffect(() => {
    hud.select(null)
  }, [href])
  return createPortal(
    <div className={styles.surface} data-command-hud>
      <div
        ref={layer}
        className={styles.hudLayer}
        aria-label="Live command HUD"
      >
        <HudToasts
          model={model}
          notices={hudToastViews(hud.state, hud.toasts)}
          onOpen={(target) => {
            if (target.kind === 'application') {
              hud.dismiss(target)
              void navigate(
                routeTarget(
                  universeName,
                  'alliance',
                  body,
                  `applications/${target.id}`,
                ),
              )
            } else hud.select(target)
          }}
          onDismiss={hud.dismiss}
          focusFallback={() =>
            layer.current
              ?.querySelector<HTMLButtonElement>('[data-testid="command-orb"]')
              ?.focus({ preventScroll: true })
          }
        />
        <TutorialAdvisor
          suspended={hud.selection !== null}
          onOpenCommands={() => hud.select('inbox')}
        >
          {(tutorialProps, tutorialSpeaking) => (
            // Threats, tutorial guidance and Command uplink take priority over news.
            <ReleaseAnnouncement
              account={view.binding.account}
              suspended={
                hud.selection !== null ||
                tutorialProps !== undefined ||
                incomingThreats(hud.state).length > 0
              }
            >
              {(announcementProps, announcing) => (
                <CommandOrb
                  hud={hud}
                  address={title.address}
                  triggerProps={tutorialProps ?? announcementProps}
                  showCaption={!tutorialSpeaking && !announcing}
                />
              )}
            </ReleaseAnnouncement>
          )}
        </TutorialAdvisor>
      </div>
      <HudPanel
        hud={hud}
        model={model}
        universe={universeName}
        body={body}
        onDraft={onDraft}
        headingAction={
          <BriefingLink appearance="button" onClick={() => hud.select(null)} />
        }
      />
    </div>,
    document.body,
  )
}
