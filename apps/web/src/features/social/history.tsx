import { useLayoutEffect, useRef } from 'react'
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
      {messages.map((m) => (
        <article
          key={m.id}
          className={`${styles.message} ${m.sender === self ? styles.own : ''}`}
        >
          <div className={styles.meta}>
            <span>{m.sender === self ? 'You' : name}</span>
            <time dateTime={new Date(m.sent_at).toISOString()}>
              {new Date(m.sent_at).toLocaleString()}
            </time>
          </div>
          <Markdown text={m.body} />
        </article>
      ))}
    </div>
  )
}
