import { createFileRoute } from '@tanstack/react-router'
import { MessagesScreen } from '../features/social/screen'
import { validateMessagesSearch } from '../shell/page-search'

export const Route = createFileRoute('/u/$universe/messages')({
  staticData: { page: 'messages' },
  validateSearch: validateMessagesSearch,
  component: MessagesScreen,
})
