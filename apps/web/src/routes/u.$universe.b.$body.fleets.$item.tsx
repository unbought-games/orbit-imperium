import { createFileRoute } from '@tanstack/react-router'
import { OperationsScreen } from '../features/game-screens'
export const Route = createFileRoute('/u/$universe/b/$body/fleets/$item')({
  staticData: { page: 'fleets' },
  component: OperationsScreen,
})
