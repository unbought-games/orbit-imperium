import { useEffect, useRef, useState } from 'react'
import { useStore } from 'zustand'
import type { Coordinator } from '../../client-model/coordinator'
import { commandId } from '../../adapters/command-id'
import { Markdown } from '../alliances/shared'
import { Button, ButtonLink } from '../../ui/button'
import { universeSlug } from '../../client-model/universe-name'
import type { HudTarget } from './model'
import styles from './hud.module.css'
export function HudMessage({
  model,
  target,
  universe,
  body,
  close,
}: {
  model: Coordinator
  target: HudTarget
  universe: string
  body?: string
  close: () => void
}) {
  const mailbox = useStore(model.store, (s) => s.mailbox)
  const conversation =
    target.kind === 'conversation'
      ? mailbox?.conversations.find((c) => c.latest.id === target.id)
      : null
  const circular =
    target.kind === 'circular'
      ? mailbox?.circulars.find((c) => c.id === target.id)
      : null
  const message = conversation?.latest ?? circular
  const unread = conversation
    ? conversation.unread
    : circular
      ? !circular.read
      : false
  const attempted = useRef<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function markRead() {
    if (busy || (!conversation && !circular)) return
    setBusy(true)
    setError('')
    try {
      const result = await model.socialCommand({
        command_id: commandId(crypto),
        action: conversation
          ? {
              type: 'Read',
              player: conversation.contact.player,
              message: conversation.latest.id,
            }
          : { type: 'ReadCircular', circular: circular!.id },
      })
      if (!result)
        throw new Error('Unable to confirm the read status. Try again.')
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Unable to mark read. Try again.',
      )
    } finally {
      setBusy(false)
    }
  }
  useEffect(() => {
    if (!message || !unread || attempted.current === message.id) return
    attempted.current = message.id
    void markRead()
  }, [message?.id, unread])
  if (!message)
    return (
      <p>
        This message has changed or is no longer available. Open Messages to see
        the latest conversation.
      </p>
    )
  return (
    <>
      <p className={styles.noticeText}>
        From {conversation?.contact.username ?? circular?.sender_name} ·{' '}
        {new Date(message.sent_at).toLocaleString()}
      </p>
      {circular && (
        <p className={styles.noticeText}>
          [{circular.alliance_tag}] {circular.alliance_name}
        </p>
      )}
      <div className={styles.mailBody}>
        <Markdown text={message.body} />
      </div>
      {error && <p role="alert">{error}</p>}
      <div className={styles.panelActions}>
        {unread && (
          <Button disabled={busy} onClick={() => void markRead()}>
            {busy ? 'Marking read…' : 'Mark read'}
          </Button>
        )}
        <ButtonLink
          to="/u/$universe/messages"
          params={{ universe: universeSlug(universe) }}
          search={{ body, player: conversation?.contact.player }}
          onClick={close}
        >
          {conversation ? 'Open conversation' : 'Open Messages'}
        </ButtonLink>
      </div>
    </>
  )
}
