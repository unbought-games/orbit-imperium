import type { DispatchDraft } from '../missions'
import { useLayoutEffect, useRef } from 'react'
import { ArrowLeft, Radio, Shield, X } from 'lucide-react'
import type { Coordinator } from '../../client-model/coordinator'
import { currentServerTime } from '../../client-model/game-projection'
import { ButtonLink } from '../../ui/button'
import { lockSheetDocument } from '../../ui/action-sheet-effects'
import { ResourceSummary } from '../../ui/number-value'
import { routeTarget } from '../../shell/route-target'
import { IncomingFleet } from '../incoming-fleet'
import { arrivalCountdown } from '../mission-presentation'
import { HudInbox } from './hud-inbox'
import { HudReport } from './hud-report'
import { HudMessage } from './hud-message'
import { incomingThreats, incomingKey, noticeContent, noticeKey } from './model'
import type { CommandHudState } from './use-command-hud'
import styles from './hud.module.css'
export function HudPanel({
  hud,
  model,
  universe,
  body,
  onDraft,
}: {
  hud: CommandHudState
  model: Coordinator
  universe: string
  body?: string
  onDraft: (draft: DispatchDraft) => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const title = useRef<HTMLHeadingElement>(null)
  const inboxScroll = useRef(0)
  const selected = hud.selection
  const selectionKey =
    selected && selected !== 'inbox' ? noticeKey(selected) : selected
  const detail = selected === 'inbox' ? null : selected
  const open = selected !== null
  const close = () => hud.select(null)
  useLayoutEffect(() => {
    const dialog = ref.current
    if (!open || !dialog) return
    inboxScroll.current = 0
    const unlock = lockSheetDocument()
    dialog.showModal()
    return () => {
      dialog.close()
      unlock()
    }
  }, [open])
  useLayoutEffect(() => {
    if (!selectionKey) return
    if (ref.current)
      ref.current.scrollTop = selectionKey === 'inbox' ? inboxScroll.current : 0
    title.current?.focus({ preventScroll: true })
  }, [selectionKey])
  const content =
    selected && selected !== 'inbox' ? noticeContent(hud.state, selected) : null
  const threats = incomingThreats(hud.state)
  const view = hud.state.view
  const fleet =
    selected && selected !== 'inbox' && selected.kind === 'incoming'
      ? threats.find((f) => incomingKey(f) === selected.id)
      : null
  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      data-tone={content?.tone ?? 'champagne'}
      aria-labelledby="command-hud-title"
      onCancel={close}
      onClose={close}
      onClick={(event) => {
        if (event.target === event.currentTarget) close()
      }}
    >
      <div className={styles.dialogInterior}>
        <header className={styles.dialogHeader}>
          {selected && selected !== 'inbox' ? (
            <button
              type="button"
              className={styles.backToList}
              onClick={() => hud.select('inbox')}
            >
              <ArrowLeft size={16} aria-hidden="true" />
              Back to list
            </button>
          ) : (
            <span className={styles.eyebrow}>
              <Radio size={12} />
              COMMAND NETWORK
            </span>
          )}
          <button type="button" aria-label="Close command HUD" onClick={close}>
            <X size={20} />
          </button>
        </header>
        <h2 id="command-hud-title" ref={title} tabIndex={-1}>
          {selected === 'inbox'
            ? 'Command uplink'
            : (content?.title ?? 'Intelligence')}
        </h2>
        <div className={styles.signal}>
          <span />
          <span />
          <span />
          <span />
          <span />
          {hud.state.stale ? 'CONNECTION INTERRUPTED' : 'SECURE CONNECTION'}
        </div>
        <div className={styles.panelContent}>
          {selected && (
            <HudInbox
              hud={hud}
              model={model}
              universe={universe}
              body={body}
              scrollRoot={ref}
              close={close}
              onSelect={(target) => {
                inboxScroll.current = ref.current?.scrollTop ?? 0
                hud.select(target)
              }}
            />
          )}
          {detail?.kind === 'report' ? (
            <HudReport
              key={detail.id}
              model={model}
              report={detail.id}
              onDraft={onDraft}
              universe={universe}
              body={body}
              close={close}
            />
          ) : detail?.kind === 'conversation' || detail?.kind === 'circular' ? (
            <HudMessage
              key={noticeKey(detail)}
              model={model}
              target={detail}
              universe={universe}
              body={body}
              close={close}
            />
          ) : detail?.kind === 'incoming' ? (
            <>
              {fleet && view?.protocol === 4 ? (
                <IncomingFleet
                  fleet={fleet}
                  view={view}
                  now={currentServerTime(hud.state)}
                />
              ) : (
                <p>
                  This approach is no longer present in the latest server view.
                </p>
              )}
              <div className={styles.panelActions}>
                <ButtonLink
                  {...routeTarget(universe, 'fleets', fleet?.target ?? body)}
                  onClick={close}
                >
                  View fleet activity
                </ButtonLink>
              </div>
            </>
          ) : detail?.kind === 'command' ? (
            <>
              <p className={styles.noticeText}>
                {content?.detail ??
                  'This order has been confirmed. Open your activity to see its current state.'}
              </p>
              {content?.deadline !== undefined && (
                <p>
                  Arrival:{' '}
                  {arrivalCountdown(
                    content.deadline,
                    currentServerTime(hud.state),
                  )}
                </p>
              )}
              {content?.costs && <ResourceSummary value={content.costs} />}
              <div className={styles.panelActions}>
                <ButtonLink
                  {...routeTarget(
                    universe,
                    content?.icon === 'spy' || content?.icon === 'fleet'
                      ? 'fleets'
                      : 'overview',
                    content?.body ?? body,
                  )}
                  onClick={close}
                >
                  View activity
                </ButtonLink>
              </div>
            </>
          ) : null}
        </div>
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
