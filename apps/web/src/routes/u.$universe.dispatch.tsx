import { validateDispatchSearch } from '../shell/dispatch-location'
import { createFileRoute } from '@tanstack/react-router'
import { OperationsScreen } from '../features/game-screens'
export const Route = createFileRoute('/u/$universe/dispatch')({
  validateSearch: validateDispatchSearch,
  staticData: { page: 'dispatch' },
  component: OperationsScreen,
})
