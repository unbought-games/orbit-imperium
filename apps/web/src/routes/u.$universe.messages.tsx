import { createFileRoute } from '@tanstack/react-router'
import { MessagesScreen } from '../features/social/screen'
import { validateBodySearch } from '../shell/routes'
export const Route = createFileRoute('/u/$universe/messages')({
  staticData: { page: 'messages' },
  validateSearch: (
    search: Record<string, unknown>,
  ): { body?: string; player?: string } => {
    const body = validateBodySearch(search)
    if (search.player === undefined) return body
    if (
      typeof search.player !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        search.player,
      )
    )
      throw new Error('This address contains an invalid player.')
    return { ...body, player: search.player }
  },
  component: MessagesScreen,
})
