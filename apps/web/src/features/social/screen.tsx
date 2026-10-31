import { conversationUnread } from '../../client-model/social'
import { MessageHistory } from './history'
import { universeSlug } from '../../client-model/universe-name'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { bindingKey } from '../../client-model/commands'
import type {
  SocialController,
  SocialQuery,
  SocialView,
} from '../../client-model/social'
import { useGameSession } from '../../shell/session-context'
import { useProfilePlayers } from '../../shell/player-profiles-context'
import { Button } from '../../ui/button'
import { PlayerName } from '../player-name'
import { Markdown } from '../alliances/shared'
import { ContactActions } from './contact-actions'
import { Composer } from './composer'
import { useSocial } from './use-social'
import styles from './social.module.css'
const tabs = [
  'Conversations',
  'Circulars',
  'Friends',
  'Requests',
  'Blocks',
] as const
type Tab = (typeof tabs)[number]
function tabQuery(tab: Tab): SocialQuery {
  return tab === 'Conversations' || tab === 'Circulars'
    ? { type: tab, cursor: null, limit: 30 }
    : { type: 'Contacts', kind: tab, cursor: null, limit: 30 }
}
export function MessagesScreen() {
  const { view } = useGameSession()
  return <Workspace key={bindingKey(view.binding)} />
}
function useReadPosition(
  controller: SocialController,
  player: string | undefined,
  history: SocialView | null,
  busy: boolean,
) {
  const marked = useRef('')
  const latest = history?.messages.at(-1)?.id
  useEffect(() => {
    if (
      busy ||
      !player ||
      !latest ||
      document.hidden ||
      marked.current === latest
    )
      return
    const state = controller.store.getState()
    if (state.pending || state.busy) return
    marked.current = latest
    void controller.markRead(player, latest).then((ok) => {
      if (!ok) marked.current = ''
    })
  }, [controller, player, latest, history, busy])
}
function Workspace() {
  const { view, universeName } = useGameSession()
  const search = useSearch({ strict: false }) as {
    player?: string
    body?: string
  }
  const navigate = useNavigate()
  const [selectedTab, setTab] = useState<Tab>('Conversations')
  const tab: Tab = search.player ? 'Conversations' : selectedTab
  const { controller, state } = useSocial(search.player)
  useEffect(() => {
    void controller.list(tabQuery(tab))
  }, [controller, tab])
  const alliance = state.alliance
  const busy = state.busy || !!state.pending
  const run = controller.run.bind(controller)
  const history = state.history
  const self = view.binding.player
  const select = (player?: string) => {
    setTab('Conversations')
    void navigate({
      to: '/u/$universe/messages',
      params: { universe: universeSlug(universeName) },
      search: { body: search.body, player },
    })
  }
  useReadPosition(controller, search.player, history, busy)
  useProfilePlayers([
    ...(state.list?.conversations.map((c) => c.contact.player) ?? []),
    ...(state.list?.contacts.map((c) => c.player) ?? []),
    ...(state.list?.circulars.map((c) => c.sender) ?? []),
    ...(history?.contact ? [history.contact.player] : []),
  ])
  const changeTab = (next: Tab) => {
    select()
    setTab(next)
    if (next === 'Circulars') void controller.loadAlliance()
  }
  return (
    <section className={styles.workspace} aria-label="Messages and friends">
      <h2>Conversations and contacts</h2>
      <div className={styles.tabs} role="group" aria-label="Message categories">
        {tabs.map((t) => (
          <Button
            key={t}
            variant={t === tab ? 'primary' : 'secondary'}
            aria-pressed={t === tab}
            onClick={() => changeTab(t)}
          >
            {t}
          </Button>
        ))}
      </div>
      {state.error && <p role="alert">{state.error}</p>}
      {state.pending && !state.busy && (
        <Button onClick={() => void controller.retry()}>
          Retry pending action
        </Button>
      )}
      <div className={styles.actions}>
        <Button
          variant="secondary"
          disabled={state.loading}
          onClick={() => {
            void controller.list(tabQuery(tab))
            if (search.player) void controller.history('newer')
          }}
        >
          Refresh
        </Button>
      </div>
      <div className={tab === 'Conversations' ? styles.layout : undefined}>
        <div
          className={`${styles.list} ${search.player && tab === 'Conversations' ? styles.selectedList : ''}`}
          aria-label={tab}
        >
          {state.loading && <p role="status">Loading…</p>}
          {state.list?.conversations.map((c) => (
            <article key={c.contact.player} className={styles.card}>
              <PlayerName
                player={c.contact.player}
                fallback={c.contact.username}
              />
              <Button
                variant="ghost"
                aria-label={`Open conversation with ${c.contact.username}`}
                onClick={() => select(c.contact.player)}
              >
                Open conversation
                {conversationUnread(c, state.readPositions) && (
                  <strong> · Unread</strong>
                )}
              </Button>
              <p className={styles.preview}>{c.latest.body}</p>
              <small>{new Date(c.latest.sent_at).toLocaleString()}</small>
            </article>
          ))}
          {state.list?.contacts.map((c) => (
            <article key={c.player} className={styles.card}>
              <PlayerName player={c.player} fallback={c.username} />
              <Button
                variant="ghost"
                aria-label={`Message ${c.username}`}
                onClick={() => select(c.player)}
              >
                Message
              </Button>
              {c.request && !c.accepted && (
                <p>
                  {c.requested_by === self
                    ? 'Friend request sent'
                    : 'Wants to be your friend'}
                </p>
              )}
              <ContactActions contact={c} self={self} run={run} busy={busy} />
            </article>
          ))}
          {state.list?.circulars.map((c) => (
            <article key={c.id} className={styles.card}>
              <h2>
                [{c.alliance_tag}] {c.alliance_name}
                {!c.read && ' · Unread'}
              </h2>
              <p>
                From <PlayerName player={c.sender} fallback={c.sender_name} /> ·{' '}
                {new Date(c.sent_at).toLocaleString()}
              </p>
              <Markdown text={c.body} />
              <div className={styles.actions}>
                {c.sender !== self && (
                  <Button variant="secondary" onClick={() => select(c.sender)}>
                    Message sender privately
                  </Button>
                )}
                {!c.read && (
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={async () => {
                      if (await run({ type: 'ReadCircular', circular: c.id }))
                        void controller.list()
                    }}
                  >
                    Mark read
                  </Button>
                )}
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() =>
                    void run({ type: 'HideCircular', circular: c.id })
                  }
                >
                  Hide circular
                </Button>
              </div>
            </article>
          ))}
          {!state.loading &&
            state.list &&
            ![
              state.list.conversations,
              state.list.contacts,
              state.list.circulars,
            ].some((a) => a.length) && (
              <p>
                {tab === 'Conversations'
                  ? 'No conversations yet. Message a player from Galaxy, their profile, or a report.'
                  : `No ${tab.toLowerCase()} yet.`}
              </p>
            )}
          {state.list?.next_cursor && (
            <Button
              variant="secondary"
              disabled={state.loading}
              onClick={() => void controller.moreList()}
            >
              Load more
            </Button>
          )}
          {tab === 'Circulars' &&
            alliance?.permissions.includes('SendCircular') && (
              <>
                <h2>Send to [{alliance.summary.tag}]</h2>
                <p>One-way announcement to current members. No reply-all.</p>
                <Composer
                  key={alliance.summary.id}
                  target={alliance.summary.id}
                  kind="Circular"
                  run={run}
                  busy={busy}
                  completed={state.completed}
                />
              </>
            )}
        </div>
        {tab === 'Conversations' && (
          <section className={styles.conversation} aria-label="Conversation">
            {search.player && (
              <Button variant="secondary" onClick={() => select()}>
                Back to conversations
              </Button>
            )}
            {state.loadingHistory && !history && (
              <p role="status">Loading messages…</p>
            )}
            {history?.contact && (
              <>
                <h2>
                  <PlayerName
                    player={history.contact.player}
                    fallback={history.contact.username}
                  />
                </h2>
                <ContactActions
                  contact={history.contact}
                  self={self}
                  run={run}
                  busy={busy}
                />
                {history.next_cursor && (
                  <Button
                    variant="secondary"
                    disabled={state.loadingHistory}
                    onClick={() => void controller.history('older')}
                  >
                    Load older messages
                  </Button>
                )}
                <MessageHistory
                  key={`history:${history.contact.player}`}
                  messages={history.messages}
                  self={self}
                  name={history.contact.username}
                />
                {!history.messages.length && <p>Start your conversation.</p>}
                {history.contact.blocked ? (
                  <p>This player is blocked. Unblock them to send messages.</p>
                ) : (
                  <Composer
                    key={`composer:${history.contact.player}`}
                    target={history.contact.player}
                    kind="Send"
                    run={run}
                    busy={busy}
                    completed={state.completed}
                  />
                )}
                {!!history.messages.length && (
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={async () => {
                      if (
                        await run({
                          type: 'Hide',
                          player: history.contact!.player,
                          message: history.messages.at(-1)!.id,
                        })
                      )
                        select()
                    }}
                  >
                    Hide conversation
                  </Button>
                )}
              </>
            )}
            {!search.player && (
              <p>Select a conversation to read or send messages.</p>
            )}
          </section>
        )}
      </div>
    </section>
  )
}
