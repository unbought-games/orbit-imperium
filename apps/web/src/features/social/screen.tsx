import { ArrowLeft, MessageCircle, RefreshCw } from 'lucide-react'
import {
  CategoryNavigation,
  type MessageCategory as Tab,
} from './category-navigation'
import { TaskHeader } from '../../ui/task-header'
import { EmptyState } from '../../ui/empty-state'
import { ConversationList } from './conversation-list'
import { ThreadActions } from './thread-actions'
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
import { useMessageDrafts } from './use-message-drafts'
import { useSocial } from './use-social'
import styles from './social.module.css'
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
  const drafts = useMessageDrafts(state.completed)
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
    <section
      className={styles.workspace}
      data-thread={!!search.player}
      aria-label="Messages and friends"
    >
      <div className={styles.topBar}>
        <TaskHeader>
          <div className={styles.headerHeading}>
            <h2>Messages</h2>
            <CategoryNavigation value={tab} onChange={changeTab} />
          </div>
          <Button
            variant="ghost"
            size="icon"
            className={styles.refresh}
            aria-label="Refresh"
            title="Refresh messages"
            disabled={state.loading}
            onClick={() => {
              void controller.list(tabQuery(tab))
              if (search.player) void controller.history('newer')
            }}
          >
            <RefreshCw size={16} aria-hidden="true" />
          </Button>
        </TaskHeader>
      </div>
      {state.error && (
        <div>
          <p role="alert">{state.error}</p>
          <Button
            variant="secondary"
            onClick={() => {
              void controller.list(tabQuery(tab))
              if (search.player) void controller.history('newer')
            }}
          >
            Retry messages
          </Button>
        </div>
      )}
      {state.pending && !state.busy && (
        <Button onClick={() => void controller.retry()}>
          Retry pending action
        </Button>
      )}
      <div className={tab === 'Conversations' ? styles.layout : undefined}>
        <div
          className={`${styles.list} ${search.player && tab === 'Conversations' ? styles.selectedList : ''}`}
          aria-label={tab}
        >
          {state.loading && tab !== 'Conversations' && (
            <p role="status">Loading…</p>
          )}
          {tab === 'Conversations' && (
            <ConversationList
              list={state.list}
              positions={state.readPositions}
              self={self}
              selected={search.player}
              loading={state.loading}
              select={select}
              more={() => void controller.moreList()}
              friends={() => changeTab('Friends')}
            />
          )}
          {state.list?.contacts.map((c) => (
            <article key={c.player} className={styles.card}>
              <div className={styles.contactHeader}>
                <PlayerName player={c.player} fallback={c.username} />
                <div className={styles.actions}>
                  <Button
                    variant="secondary"
                    size="small"
                    aria-label={`Message ${c.username}`}
                    onClick={() => select(c.player)}
                  >
                    <MessageCircle size={16} aria-hidden="true" />
                    Message
                  </Button>
                  <ContactActions
                    contact={c}
                    self={self}
                    run={run}
                    busy={busy}
                  />
                </div>
              </div>
              {c.request && !c.accepted && (
                <p>
                  {c.requested_by === self
                    ? 'Friend request sent'
                    : 'Wants to be your friend'}
                </p>
              )}
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
          {tab !== 'Conversations' &&
            !state.loading &&
            state.list &&
            ![
              state.list.conversations,
              state.list.contacts,
              state.list.circulars,
            ].some((a) => a.length) && (
              <p>
                {`No ${tab.toLowerCase()} yet.`}
                {tab === 'Friends' &&
                  ' Open a player profile in Galaxy to message them or add a friend.'}
              </p>
            )}
          {tab !== 'Conversations' && state.list?.next_cursor && (
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
                  body={drafts.get(alliance.summary.id)}
                  setBody={(body) => drafts.set(alliance.summary.id, body)}
                />
              </>
            )}
        </div>
        {tab === 'Conversations' && (
          <section
            className={`${styles.conversation} ${!search.player ? styles.unselectedThread : ''}`}
            aria-label="Conversation"
          >
            {search.player && !history?.contact && (
              <Button variant="ghost" onClick={() => select()}>
                <ArrowLeft size={16} aria-hidden="true" />
                Back to conversations
              </Button>
            )}
            {state.loadingHistory && !history && (
              <p role="status">Loading messages…</p>
            )}
            {history?.contact && (
              <>
                <header className={styles.threadHeader}>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Back to conversations"
                    title="Back to conversations"
                    onClick={() => select()}
                  >
                    <ArrowLeft size={16} aria-hidden="true" />
                  </Button>
                  <div className={styles.threadIdentity}>
                    <h2>
                      <PlayerName
                        player={history.contact.player}
                        fallback={history.contact.username}
                      />
                    </h2>
                    <span>
                      {history.contact.blocked
                        ? 'Blocked player'
                        : history.contact.accepted
                          ? 'Friend · Direct message'
                          : 'Direct message'}
                    </span>
                  </div>
                  <ThreadActions
                    key={history.contact.player}
                    contact={history.contact}
                    self={self}
                    run={run}
                    busy={busy}
                    hide={
                      history.messages.length
                        ? async () => {
                            if (
                              await run({
                                type: 'Hide',
                                player: history.contact!.player,
                                message: history.messages.at(-1)!.id,
                              })
                            )
                              select()
                          }
                        : undefined
                    }
                  />
                </header>
                <div className={styles.historyToolbar}>
                  {history.next_cursor && (
                    <Button
                      variant="ghost"
                      disabled={state.loadingHistory}
                      onClick={() => void controller.history('older')}
                    >
                      Load older messages
                    </Button>
                  )}
                </div>
                <MessageHistory
                  key={`history:${history.contact.player}`}
                  messages={history.messages}
                  self={self}
                  name={history.contact.username}
                />
                {history.contact.blocked ? (
                  <p className={styles.blocked}>
                    This player is blocked. Unblock them to send messages.
                  </p>
                ) : (
                  <Composer
                    key={`composer:${history.contact.player}`}
                    target={history.contact.player}
                    name={history.contact.username}
                    kind="Send"
                    run={run}
                    busy={busy}
                    body={drafts.get(history.contact.player)}
                    setBody={(body) =>
                      drafts.set(history.contact!.player, body)
                    }
                  />
                )}
              </>
            )}
            {!search.player && (
              <div className={styles.threadEmpty}>
                <EmptyState
                  icon={MessageCircle}
                  title="Your conversations"
                  description="Select a player to pick up where you left off, or start a conversation with a friend."
                  actions={
                    <Button
                      variant="secondary"
                      onClick={() => changeTab('Friends')}
                    >
                      Find a friend
                    </Button>
                  }
                />
              </div>
            )}
          </section>
        )}
      </div>
    </section>
  )
}
