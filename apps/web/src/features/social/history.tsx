import { Fragment, useLayoutEffect, useRef } from 'react'
import { messageDay, messageTime, sameMessageDay } from './presentation'
import { MessageCircle } from 'lucide-react'
import { EmptyState } from '../../ui/empty-state'
import type { components } from '../../contracts'
import { Markdown } from '../alliances/shared'
import styles from './social.module.css'
export function MessageHistory({
  messages,
  self,
  name,
}: {
  messages: components['schemas']['SocialMessage'][]
  self: string
  name: string
}) {
  const element = useRef<HTMLDivElement>(null)
  const previous = useRef<{
    first?: string
    height: number
    top: number
    nearBottom: boolean
  } | null>(null)
  useLayoutEffect(() => {
    const el = element.current
    if (!el) return
    const old = previous.current
    const first = messages[0]?.id
    if (!old || (old.nearBottom && old.first === first))
      el.scrollTop = el.scrollHeight
    else if (old.first !== first)
      el.scrollTop = old.top + el.scrollHeight - old.height
    previous.current = {
      first,
      height: el.scrollHeight,
      top: el.scrollTop,
      nearBottom: el.scrollHeight - el.scrollTop - el.clientHeight < 80,
    }
  }, [messages])
  return (
    <div
      ref={element}
      className={styles.history}
      aria-label="Message history"
      onScroll={() => {
        const el = element.current
        if (el && previous.current) {
          previous.current.top = el.scrollTop
          previous.current.nearBottom =
            el.scrollHeight - el.scrollTop - el.clientHeight < 80
        }
      }}
    >
      {!messages.length && (
        <div className={styles.threadEmpty}>
          <EmptyState
            variant="compact"
            icon={MessageCircle}
            title="Start your conversation."
            description={`Say hello to ${name}. Your messages will appear here.`}
          />
        </div>
      )}
      {messages.map((m, index) => (
        <Fragment key={m.id}>
          {(index === 0 ||
            !sameMessageDay(messages[index - 1].sent_at, m.sent_at)) && (
            <div className={styles.dayDivider}>{messageDay(m.sent_at)}</div>
          )}
          <article
            aria-label={
              m.sender === self
                ? `Message from you to ${name}`
                : `Message from ${name} to you`
            }
            className={`${styles.message} ${m.sender === self ? styles.own : ''}`}
          >
            <div className={styles.meta}>
              <span>{m.sender === self ? 'You' : name}</span>
              <time
                dateTime={new Date(m.sent_at).toISOString()}
                title={new Date(m.sent_at).toLocaleString()}
              >
                {messageTime(m.sent_at)}
              </time>
            </div>
            <Markdown text={m.body} compact />
          </article>
        </Fragment>
      ))}
    </div>
  )
}
