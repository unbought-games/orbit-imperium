import { useRef, useState } from 'react'
import { Pin } from 'lucide-react'
import type { components } from '../../contracts'
import { PlayerName } from '../player-name'
import { can, type AllianceDetail } from '../../client-model/alliances'
import { Button } from '../../ui/button'
import { Markdown, type Run } from './shared'
import { NoticeEditor } from './notice-editor'
import { NoticeActions } from './notice-actions'
import styles from './board.module.css'

type Post = components['schemas']['AlliancePost']
function Notice({
  detail,
  post,
  player,
  run,
  busy,
}: {
  detail: AllianceDetail
  post: Post
  player: string
  run: Run
  busy: boolean
}) {
  const [editing, setEditing] = useState(false)
  const article = useRef<HTMLElement>(null)
  const editable = post.author === player || can(detail, 'ManagePosts')
  const finishEdit = () => {
    setEditing(false)
    article.current?.focus({ preventScroll: true })
  }
  return (
    <article
      className={styles.notice}
      ref={article}
      tabIndex={-1}
      aria-label={post.title || `Notice by ${post.author_name}`}
    >
      {editing && editable ? (
        <NoticeEditor
          alliance={detail.summary.id}
          post={post}
          run={run}
          busy={busy}
          onClose={finishEdit}
        />
      ) : (
        <>
          <div className={styles.noticeContent}>
            <div>
              {post.title && <h3 className={styles.title}>{post.title}</h3>}
              {post.body.trim() && <Markdown text={post.body} compact />}
            </div>
            <NoticeActions
              post={post}
              alliance={detail.summary.id}
              editable={editable}
              pinnable={can(detail, 'PinPosts')}
              busy={busy}
              run={run}
              onEdit={() => setEditing(true)}
            />
          </div>
          <footer className={styles.noticeFooter}>
            <div className={styles.byline}>
              <PlayerName
                player={post.author}
                fallback={post.author_name}
                alliance={
                  detail.members?.some(
                    (member) => member.player === post.author,
                  )
                    ? detail.summary
                    : undefined
                }
              />
              {' · '}
              <time
                dateTime={new Date(post.created_at).toISOString()}
                title={new Date(post.created_at).toLocaleString()}
              >
                {new Date(post.created_at).toLocaleString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </time>
              {post.updated_at > post.created_at && (
                <span title={new Date(post.updated_at).toLocaleString()}>
                  {' '}
                  · Edited
                </span>
              )}
              {post.pinned && (
                <span className={styles.pinned}>
                  <Pin size={12} aria-hidden="true" /> Pinned
                </span>
              )}
            </div>
          </footer>
        </>
      )}
    </article>
  )
}
export function Board({
  detail,
  player,
  run,
  busy,
  load,
  notice,
}: {
  detail: AllianceDetail
  player: string
  run: Run
  busy: boolean
  load: (cursor: string) => void
  notice?: string
}) {
  return (
    <section className={styles.board} aria-label="Alliance noticeboard">
      {notice && <p role="status">{notice}</p>}
      {can(detail, 'PublishPosts') && (
        <NoticeEditor alliance={detail.summary.id} run={run} busy={busy} />
      )}
      {detail.posts?.length === 0 && (
        <p className={styles.empty}>No notices yet.</p>
      )}
      <div className={styles.feed}>
        {detail.posts?.map((post) => (
          <Notice
            key={post.id}
            detail={detail}
            post={post}
            player={player}
            run={run}
            busy={busy}
          />
        ))}
      </div>
      {detail.next_post_before && (
        <nav className={styles.pagination} aria-label="Notice pages">
          <Button
            variant="secondary"
            size="small"
            disabled={busy}
            onClick={() => load(detail.next_post_before!)}
          >
            Load older notices
          </Button>
        </nav>
      )}
    </section>
  )
}
