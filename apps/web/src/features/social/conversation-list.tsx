import { MessageCircle, Search, SlidersHorizontal } from 'lucide-react'
import { useRef, useState } from 'react'
import { conversationUnread, type SocialView } from '../../client-model/social'
import { Button } from '../../ui/button'
import { Input, Field, Select } from '../../ui/form'
import { ActionPopover } from '../../ui/action-popover'
import { EmptyState } from '../../ui/empty-state'
import { PlayerName } from '../player-name'
import {
  defaultConversationOptions,
  messageDay,
  visibleConversations,
  type ConversationOptions,
} from './presentation'
import styles from './social.module.css'

export function ConversationList({
  list,
  positions,
  self,
  selected,
  loading,
  select,
  more,
  friends,
}: {
  list: SocialView | null
  positions: Record<string, string>
  self: string
  selected?: string
  loading: boolean
  select: (player: string) => void
  more: () => void
  friends: () => void
}) {
  const [options, setOptions] = useState(defaultConversationOptions)
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLButtonElement>(null)
  const conversations = visibleConversations(
    list?.conversations ?? [],
    positions,
    options,
  )
  const filtered = options.search.trim() || options.unread
  return (
    <>
      <div className={styles.listHeading}>
        <h2>Direct messages</h2>
        <Button variant="ghost" onClick={friends}>
          Find a friend
        </Button>
      </div>
      <div className={styles.listTools}>
        <label className={styles.search}>
          <Search size={16} aria-hidden="true" />
          <Input
            aria-label="Search conversations"
            placeholder="Search conversations"
            value={options.search}
            onChange={(e) => setOptions({ ...options, search: e.target.value })}
          />
        </label>
        <Button
          variant="ghost"
          size="icon"
          ref={anchor}
          aria-label="Conversation filters and sorting"
          title="Filter and sort"
          aria-expanded={open}
          aria-pressed={options.unread || options.sort !== 'newest'}
          onClick={() => setOpen(!open)}
        >
          <SlidersHorizontal size={16} aria-hidden="true" />
        </Button>
      </div>
      <ActionPopover
        open={open}
        onOpenChange={setOpen}
        anchorRef={anchor}
        title="Filter and sort"
      >
        <div className={styles.filters}>
          <Field>
            Show
            <Select
              aria-label="Show"
              value={options.unread ? 'unread' : 'all'}
              onChange={(e) =>
                setOptions({ ...options, unread: e.target.value === 'unread' })
              }
            >
              <option value="all">All conversations</option>
              <option value="unread">Unread only</option>
            </Select>
          </Field>
          <Field>
            Sort by
            <Select
              aria-label="Sort by"
              value={options.sort}
              onChange={(e) =>
                setOptions({
                  ...options,
                  sort: e.target.value as ConversationOptions['sort'],
                })
              }
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="name">Player name</option>
            </Select>
          </Field>
        </div>
      </ActionPopover>
      {options.unread && (
        <div className={styles.filterNotice}>
          Unread only
          <Button
            variant="ghost"
            onClick={() => setOptions({ ...options, unread: false })}
          >
            Show all
          </Button>
        </div>
      )}
      <div className={styles.conversationRows}>
        {loading && !list && <p role="status">Loading conversations…</p>}
        {conversations.map((c) => {
          const unread = conversationUnread(c, positions)
          return (
            <Button
              key={c.contact.player}
              variant="ghost"
              className={styles.conversationRow}
              aria-current={selected === c.contact.player ? 'true' : undefined}
              aria-pressed={selected === c.contact.player}
              aria-label={`Open conversation with ${c.contact.username}${unread ? ' · Unread' : ''}`}
              onClick={() => select(c.contact.player)}
            >
              <span className={styles.rowIdentity}>
                <strong>
                  <PlayerName
                    player={c.contact.player}
                    fallback={c.contact.username}
                    interactive={false}
                    linkAlliance={false}
                  />
                </strong>
                {unread && (
                  <span className={styles.unread} aria-label="Unread" />
                )}
              </span>
              <time
                className={styles.rowTime}
                dateTime={new Date(c.latest.sent_at).toISOString()}
                title={new Date(c.latest.sent_at).toLocaleString()}
              >
                {messageDay(c.latest.sent_at)}
              </time>
              <span className={styles.preview}>
                {c.latest.sender === self ? 'You: ' : ''}
                {c.latest.body}
              </span>
            </Button>
          )
        })}
        {list && !loading && !conversations.length && (
          <EmptyState
            variant="compact"
            icon={MessageCircle}
            title={
              filtered ? 'No matching conversations' : 'No conversations yet'
            }
            description={
              filtered
                ? 'Try another name or message, or clear your filters.'
                : 'Message a player from Galaxy, their profile, or your friends.'
            }
            actions={
              filtered ? (
                <Button
                  variant="ghost"
                  onClick={() => setOptions(defaultConversationOptions)}
                >
                  Clear filters
                </Button>
              ) : (
                <Button variant="secondary" onClick={friends}>
                  Find a friend
                </Button>
              )
            }
          />
        )}
        {list?.next_cursor && (
          <>
            <p className={styles.hint}>
              Search and filters apply to loaded conversations.
            </p>
            <Button variant="ghost" disabled={loading} onClick={more}>
              Load more
            </Button>
          </>
        )}
      </div>
    </>
  )
}
