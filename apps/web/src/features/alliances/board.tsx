import { PlayerName } from '../player-name'
import { useState } from 'react'
import type { components } from '../../contracts'
import { can, type AllianceDetail } from '../../client-model/alliances'
import { Button } from '../../ui/button'
import { Field, Input } from '../../ui/form'
import { ActionForm, ConfirmAction, Markdown, value, type Run } from './shared'
import styles from './alliances.module.css'
function PostEditor({
  detail,
  post,
  run,
  busy,
}: {
  detail: AllianceDetail
  post?: components['schemas']['AlliancePost']
  run: Run
  busy: boolean
}) {
  const [preview, setPreview] = useState<string | null>(null)
  return (
    <ActionForm
      draftKey={`post:${detail.summary.id}:${post?.id ?? 'new'}`}
      busy={busy}
      label={post ? 'Save notice' : 'Publish notice'}
      onSubmit={(data) =>
        run(
          post
            ? {
                type: 'EditPost',
                alliance: detail.summary.id,
                post: post.id,
                title: value(data, 'title'),
                body: value(data, 'body'),
              }
            : {
                type: 'CreatePost',
                alliance: detail.summary.id,
                title: value(data, 'title'),
                body: value(data, 'body'),
              },
        )
      }
    >
      <Field>
        Notice title
        <Input
          name="title"
          defaultValue={post?.title}
          required
          maxLength={120}
        />
      </Field>
      <Field>
        Notice body
        <textarea
          name="body"
          defaultValue={post?.body}
          required
          maxLength={8000}
          rows={6}
        />
      </Field>
      <p>
        Basic Markdown supported. Images, embedded content and HTML are
        disabled.
      </p>
      <Button
        type="button"
        variant="secondary"
        onClick={(e) => {
          const form = e.currentTarget.form
          if (form) setPreview(value(new FormData(form), 'body'))
        }}
      >
        Preview notice
      </Button>
      {preview !== null && (
        <div className={styles.preview}>
          <Markdown text={preview} />
        </div>
      )}
    </ActionForm>
  )
}
export function Board({
  detail,
  player,
  run,
  busy,
  load,
}: {
  detail: AllianceDetail
  player: string
  run: Run
  busy: boolean
  load: (cursor: string | null) => void
}) {
  return (
    <section className={styles.stack} aria-label="Alliance noticeboard">
      <div>
        <h3>Noticeboard</h3>
        <p>
          Private to your alliance. Up to 100 notices, with five pins. The
          oldest unpinned notice rolls off when a new notice exceeds the limit.
        </p>
      </div>
      {can(detail, 'PublishPosts') && (
        <details className={styles.card}>
          <summary>Write a notice</summary>
          <PostEditor detail={detail} run={run} busy={busy} />
        </details>
      )}
      {detail.posts?.length === 0 && <p>No notices yet.</p>}
      {detail.posts?.map((post) => (
        <article className={styles.card} key={post.id}>
          <span className={styles.meta}>
            {post.pinned ? 'Pinned · ' : ''}
            <PlayerName
              player={post.author}
              fallback={post.author_name}
              alliance={
                detail.members?.some((member) => member.player === post.author)
                  ? detail.summary
                  : undefined
              }
            />{' '}
            · {new Date(post.created_at).toLocaleString()}
          </span>
          <h4>{post.title}</h4>
          <Markdown text={post.body} />
          <div className={styles.actions}>
            {can(detail, 'PinPosts') && (
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() =>
                  void run({
                    type: 'PinPost',
                    alliance: detail.summary.id,
                    post: post.id,
                    pinned: !post.pinned,
                  })
                }
              >
                {post.pinned ? 'Unpin' : 'Pin'} {post.title}
              </Button>
            )}
            {(post.author === player || can(detail, 'ManagePosts')) && (
              <ConfirmAction
                label={`Delete ${post.title}`}
                description={`Permanently delete “${post.title}” from the noticeboard?`}
                disabled={busy}
                onConfirm={() =>
                  run({
                    type: 'DeletePost',
                    alliance: detail.summary.id,
                    post: post.id,
                  })
                }
              />
            )}
          </div>
          {(post.author === player || can(detail, 'ManagePosts')) && (
            <details>
              <summary>Edit notice</summary>
              <PostEditor detail={detail} post={post} run={run} busy={busy} />
            </details>
          )}
        </article>
      ))}
      <nav className={styles.actions} aria-label="Notice pages">
        <Button variant="secondary" disabled={busy} onClick={() => load(null)}>
          Newest notices
        </Button>
        {detail.next_post_before && (
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => load(detail.next_post_before ?? null)}
          >
            Older notices
          </Button>
        )}
      </nav>
    </section>
  )
}
