import type { RefObject } from 'react'
import type { Coordinator } from '../../client-model/coordinator'
import { occupiedFleetSlots } from '../../client-model/game-projection'
import { Button, ButtonLink } from '../../ui/button'
import { routeTarget } from '../../shell/route-target'
import { HudIconMark } from './hud-controls'
import { noticeContent, noticeKey, type HudTarget } from './model'
import type { CommandHudState } from './use-command-hud'
import { useHudInbox } from './use-hud-inbox'
import styles from './hud.module.css'

export function HudInbox({
  hud,
  model,
  universe,
  body,
  scrollRoot,
  onSelect,
  close,
}: {
  hud: CommandHudState
  model: Coordinator
  universe: string
  body?: string
  scrollRoot: RefObject<HTMLDialogElement | null>
  onSelect: (target: HudTarget) => void
  close: () => void
}) {
  const visible = hud.selection === 'inbox'
  const inbox = useHudInbox(model, hud.state, visible, scrollRoot)
  const view = hud.state.view
  return (
    <div hidden={!visible}>
      <div className={styles.reportRow}>
        <span>Fleet channels in use</span>
        <strong>
          {occupiedFleetSlots(hud.state)} /{' '}
          {view?.protocol === 4 ? view.missions.fleet_slots : '—'}
        </strong>
      </div>
      {hud.inboxError && (
        <>
          <p role="alert">{hud.inboxError}</p>
          <Button onClick={hud.retry}>Retry intelligence</Button>
        </>
      )}
      {hud.state.mailbox === null && (
        <p role="status" className={styles.noticeText}>
          Receiving intelligence…
        </p>
      )}
      <div aria-label="Intelligence list" aria-busy={inbox.loading}>
        {inbox.targets.map((target) => {
          const entry = noticeContent(hud.state, target)
          return (
            entry && (
              <button
                type="button"
                className={styles.inboxEntry}
                key={noticeKey(target)}
                data-tone={entry.tone}
                onClick={() => onSelect(target)}
              >
                <HudIconMark kind={entry.icon} />
                <span>
                  <strong>{entry.title}</strong>
                  <small>{entry.detail}</small>
                </span>
              </button>
            )
          )
        })}
      </div>
      {inbox.failed ? (
        <div>
          <p role="alert">
            Could not load more intelligence. Your current list is still here.
          </p>
          <Button onClick={inbox.retry}>Retry loading</Button>
        </div>
      ) : inbox.loading ? (
        <p role="status" className={styles.noticeText}>
          Loading intelligence…
        </p>
      ) : inbox.more ? (
        <div ref={inbox.sentinel}>
          <Button onClick={inbox.loadMore}>Load more intelligence</Button>
        </div>
      ) : (
        <p role="status" className={styles.noticeText}>
          {inbox.targets.length
            ? 'You’re all caught up.'
            : 'No new intelligence. All channels clear.'}
        </p>
      )}
      <div className={styles.panelActions}>
        <ButtonLink {...routeTarget(universe, 'reports', body)} onClick={close}>
          All reports
        </ButtonLink>
        <ButtonLink
          {...routeTarget(universe, 'messages', body)}
          onClick={close}
        >
          Messages
        </ButtonLink>
        <ButtonLink {...routeTarget(universe, 'fleets', body)} onClick={close}>
          Fleet activity
        </ButtonLink>
      </div>
    </div>
  )
}
