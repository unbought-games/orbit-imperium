import type { RefObject } from 'react'
import type { Coordinator } from '../../client-model/coordinator'
import { Button, ButtonLink } from '../../ui/button'
import { routeTarget } from '../../shell/route-target'
import { HudIconMark } from './hud-controls'
import { HudFleets } from './hud-fleets'
import { HudEnemyAttacks } from './hud-enemy-attacks'
import {
  incomingAttacks,
  noticeContent,
  noticeKey,
  type HudTarget,
} from './model'
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
  return (
    <div hidden={!visible}>
      <HudEnemyAttacks state={hud.state} onSelect={onSelect} />
      <HudFleets
        state={hud.state}
        universe={universe}
        body={body}
        close={close}
      />
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
      ) : inbox.loading || (!hud.state.reportInbox && !hud.inboxError) ? (
        <p role="status" className={styles.noticeText}>
          Loading intelligence…
        </p>
      ) : inbox.more ? (
        <div ref={inbox.sentinel}>
          <Button onClick={inbox.loadMore}>Load more intelligence</Button>
        </div>
      ) : hud.inboxError || hud.state.mailbox === null ? null : (
        <p role="status" className={styles.noticeText}>
          {inbox.targets.length
            ? 'You’re all caught up.'
            : incomingAttacks(hud.state).length
              ? 'No unread intelligence.'
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
      </div>
    </div>
  )
}
