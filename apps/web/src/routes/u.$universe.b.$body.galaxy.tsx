import { createFileRoute } from '@tanstack/react-router'
import { validateGalaxySearch } from '../shell/galaxy-location'
import { OperationsScreen } from '../features/game-screens'
export const Route = createFileRoute('/u/$universe/b/$body/galaxy')({
  staticData: { page: 'galaxy' },
  validateSearch: validateGalaxySearch,
  component: OperationsScreen,
})
