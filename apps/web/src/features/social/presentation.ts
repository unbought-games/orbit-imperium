import { conversationUnread, type SocialView } from '../../client-model/social'

export type ConversationOptions = {
  search: string
  unread: boolean
  sort: 'newest' | 'oldest' | 'name'
}
export const defaultConversationOptions: ConversationOptions = {
  search: '',
  unread: false,
  sort: 'newest',
}
export function visibleConversations(
  conversations: SocialView['conversations'],
  positions: Record<string, string>,
  options: ConversationOptions,
) {
  const query = options.search.trim().toLocaleLowerCase()
  return conversations
    .filter(
      (c) =>
        (!options.unread || conversationUnread(c, positions)) &&
        (!query ||
          c.contact.username.toLocaleLowerCase().includes(query) ||
          c.latest.body.toLocaleLowerCase().includes(query)),
    )
    .sort((a, b) => {
      if (options.sort === 'name')
        return (
          a.contact.username.localeCompare(b.contact.username) ||
          a.contact.player.localeCompare(b.contact.player)
        )
      const order = a.latest.sent_at - b.latest.sent_at
      return (
        (options.sort === 'oldest' ? order : -order) ||
        a.contact.player.localeCompare(b.contact.player)
      )
    })
}
export function sameMessageDay(a: number, b: number) {
  return new Date(a).toDateString() === new Date(b).toDateString()
}
export function messageDay(timestamp: number) {
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}
export function messageTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })
}
