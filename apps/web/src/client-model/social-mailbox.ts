import type { components } from '../contracts'
import type { SocialAction, SocialQuery, SocialView } from './social'
type S = components['schemas']
export type SocialMailbox = {
  conversations: S['SocialConversation'][]
  circulars: S['SocialCircular'][]
}
/** Read every page: old unread mail must not disappear behind the first page. */
export async function readMailbox(
  read: (query: SocialQuery) => Promise<SocialView | null>,
): Promise<SocialMailbox> {
  async function pages(type: 'Conversations' | 'Circulars') {
    const result: SocialView[] = []
    const cursors = new Set<string>()
    let cursor: string | null = null
    do {
      const page = await read({ type, cursor, limit: 50 })
      if (!page) throw new Error('Unable to confirm your inbox. Try again.')
      result.push(page)
      cursor = page.next_cursor
      if (cursor && cursors.has(cursor))
        throw new Error('Inbox pagination changed. Try again.')
      if (cursor) cursors.add(cursor)
    } while (cursor)
    return result
  }
  const [conversations, circulars] = await Promise.all([
    pages('Conversations'),
    pages('Circulars'),
  ])
  return {
    conversations: [
      ...new Map(
        conversations
          .flatMap((page) => page.conversations)
          .map((c) => [c.contact.player, c]),
      ).values(),
    ],
    circulars: [
      ...new Map(
        circulars.flatMap((page) => page.circulars).map((c) => [c.id, c]),
      ).values(),
    ],
  }
}
/** Apply only acknowledged preferences; a read of older mail never hides newer mail. */
export function acceptMailboxAction(
  mailbox: SocialMailbox | null,
  action: SocialAction,
): SocialMailbox | null {
  if (!mailbox) return null
  if (action.type === 'Read')
    return {
      ...mailbox,
      conversations: mailbox.conversations.map((c) =>
        c.contact.player === action.player && c.latest.id === action.message
          ? { ...c, unread: false }
          : c,
      ),
    }
  if (action.type === 'ReadCircular')
    return {
      ...mailbox,
      circulars: mailbox.circulars.map((c) =>
        c.id === action.circular ? { ...c, read: true } : c,
      ),
    }
  if (action.type === 'HideCircular')
    return {
      ...mailbox,
      circulars: mailbox.circulars.filter((c) => c.id !== action.circular),
    }
  if (action.type === 'Hide' || action.type === 'Block')
    return {
      ...mailbox,
      conversations: mailbox.conversations.filter(
        (c) => c.contact.player !== action.player,
      ),
    }
  return mailbox
}

/** Restart an invalidated read internally; preference changes are not inbox failures. */
export async function readStableMailbox(
  read: (query: SocialQuery) => Promise<SocialView | null>,
  version: () => number,
  active: () => boolean,
  commit: (mailbox: SocialMailbox) => void,
): Promise<void> {
  while (active()) {
    const started = version()
    try {
      const mailbox = await readMailbox((query) =>
        active() && started === version() ? read(query) : Promise.resolve(null),
      )
      if (!active()) throw new Error('Unable to confirm your inbox. Try again.')
      if (started === version()) {
        // Publish in the same turn as the version check; a later .then could
        // otherwise overwrite a preference acknowledged between microtasks.
        commit(mailbox)
        return
      }
    } catch (error) {
      if (!active() || started === version()) throw error
    }
  }
  throw new Error('Unable to confirm your inbox. Try again.')
}

/** Accepted read commands are durable facts for this session, including across later stale fetches. */
export function reconcileMailboxReads(
  mailbox: SocialMailbox,
  reads: Iterable<SocialAction>,
): SocialMailbox {
  for (const action of reads) mailbox = acceptMailboxAction(mailbox, action)!
  return mailbox
}
