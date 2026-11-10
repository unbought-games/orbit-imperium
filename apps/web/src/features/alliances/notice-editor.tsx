import { useId, useState } from 'react'
import type { components } from '../../contracts'
import { Button } from '../../ui/button'
import { useAllianceDraft } from './drafts'
import { value, type Run } from './shared'
import styles from './board.module.css'

type Post = components['schemas']['AlliancePost']
export function NoticeEditor({
  alliance,
  post,
  run,
  busy,
  onClose,
}: {
  alliance: string
  post?: Post
  run: Run
  busy: boolean
  onClose?: () => void
}) {
  const draft = useAllianceDraft(`post:${alliance}:${post?.id ?? 'new'}`)
  const [error, setError] = useState('')
  const hint = useId()
  return (
    <form
      ref={draft.form}
      className={styles.composer}
      aria-label={post ? 'Edit notice' : 'Write a notice'}
      onChange={(event) => {
        draft.onChange(event)
        setError('')
      }}
      onSubmit={(event) => {
        event.preventDefault()
        if (busy) return
        const form = event.currentTarget
        const data = new FormData(form)
        const title = value(data, 'title').trim()
        const body = value(data, 'body')
        if (!title && !body.trim()) {
          setError('Add a title or a message.')
          form.querySelector('textarea')?.focus()
          return
        }
        void run(
          post
            ? { type: 'EditPost', alliance, post: post.id, title, body }
            : { type: 'CreatePost', alliance, title, body },
        ).then((ok) => {
          if (!ok) return
          draft.clear()
          form.reset()
          onClose?.()
        })
      }}
    >
      <fieldset disabled={busy}>
        <input
          className={styles.titleInput}
          aria-label="Notice title"
          name="title"
          placeholder="Title (optional)"
          defaultValue={post?.title}
          maxLength={120}
          autoFocus={!!post}
        />
        <textarea
          className={styles.bodyInput}
          aria-label="Notice body"
          aria-describedby={hint}
          name="body"
          placeholder="Write a notice…"
          defaultValue={post?.body}
          maxLength={8000}
          rows={4}
        />
        <span id={hint} className={styles.hint}>
          Basic Markdown supported
        </span>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <div className={styles.composerFooter}>
          <div className={styles.editorActions}>
            {onClose && (
              <Button
                type="button"
                variant="ghost"
                size="small"
                onClick={() => {
                  draft.clear()
                  onClose()
                }}
              >
                Cancel
              </Button>
            )}
            <Button type="submit" size="small">
              {post ? 'Save notice' : 'Publish notice'}
            </Button>
          </div>
        </div>
      </fieldset>
    </form>
  )
}
