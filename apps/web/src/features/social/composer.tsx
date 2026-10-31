import { Send } from 'lucide-react'
import type { SocialAction } from '../../client-model/social'
import { Button } from '../../ui/button'
import styles from './social.module.css'
export function Composer({
  target,
  name,
  kind,
  busy,
  run,
  body,
  setBody,
}: {
  name?: string
  target: string
  kind: 'Send' | 'Circular'
  busy: boolean
  run: (a: SocialAction) => Promise<boolean>
  body: string
  setBody: (body: string) => void
}) {
  const length = Array.from(body).length
  const canSend = !busy && !!body.trim() && length <= 4000
  return (
    <form
      className={styles.composer}
      onSubmit={(e) => {
        e.preventDefault()
        if (canSend)
          void run(
            kind === 'Send'
              ? { type: 'Send', player: target, body }
              : { type: 'Circular', alliance: target, body },
          )
      }}
    >
      <label
        className={kind === 'Send' ? styles.srOnly : undefined}
        htmlFor="message-body"
      >
        {kind === 'Send' ? 'Message' : 'Alliance announcement'}
      </label>
      <textarea
        id="message-body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={kind === 'Send' ? 2 : 4}
        placeholder={
          kind === 'Send'
            ? `Message ${name ?? 'player'}…`
            : 'Write an alliance announcement…'
        }
        onKeyDown={(e) => {
          if (
            kind === 'Send' &&
            e.key === 'Enter' &&
            (e.ctrlKey || e.metaKey) &&
            !e.nativeEvent.isComposing
          ) {
            e.preventDefault()
            if (canSend) e.currentTarget.form?.requestSubmit()
          }
        }}
        disabled={busy}
        aria-describedby="message-help"
      />
      <div className={styles.composerFooter}>
        <small
          id="message-help"
          className={length > 4000 ? styles.limitError : undefined}
        >
          Simple Markdown · {length.toLocaleString()} / 4,000
        </small>
        <Button
          type="submit"
          disabled={!canSend}
          aria-label={kind === 'Send' ? 'Send message' : 'Send circular'}
          title={
            kind === 'Send' ? 'Send message (Ctrl or ⌘ + Enter)' : undefined
          }
        >
          <Send size={16} aria-hidden="true" />
          {kind === 'Send' ? 'Send' : 'Send circular'}
        </Button>
      </div>
    </form>
  )
}
