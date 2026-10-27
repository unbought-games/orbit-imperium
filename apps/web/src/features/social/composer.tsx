import { useEffect, useState } from 'react'
import type { SocialAction, SocialRequest } from '../../client-model/social'
import { Button } from '../../ui/button'
import styles from './social.module.css'
export function Composer({
  target,
  kind,
  busy,
  run,
  completed,
}: {
  target: string
  kind: 'Send' | 'Circular'
  busy: boolean
  run: (a: SocialAction) => Promise<boolean>
  completed: SocialRequest | null
}) {
  const [body, setBody] = useState('')
  useEffect(() => {
    const a = completed?.action
    if (
      a &&
      ((a.type === 'Send' && kind === 'Send' && a.player === target) ||
        (a.type === 'Circular' && kind === 'Circular' && a.alliance === target))
    )
      setBody('')
  }, [completed, kind, target])
  return (
    <form
      className={styles.composer}
      onSubmit={(e) => {
        e.preventDefault()
        if (body.trim())
          void run(
            kind === 'Send'
              ? { type: 'Send', player: target, body }
              : { type: 'Circular', alliance: target, body },
          )
      }}
    >
      <label htmlFor="message-body">
        {kind === 'Send' ? 'Message' : 'Alliance announcement'}
      </label>
      <textarea
        id="message-body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={4}
        disabled={busy}
        aria-describedby="message-help"
      />
      <small id="message-help">
        Simple Markdown supported. No images or HTML.{' '}
        {Array.from(body).length.toLocaleString()} / 4,000 characters.
      </small>
      <Button
        type="submit"
        disabled={busy || !body.trim() || Array.from(body).length > 4000}
      >
        {kind === 'Send' ? 'Send message' : 'Send circular'}
      </Button>
    </form>
  )
}
