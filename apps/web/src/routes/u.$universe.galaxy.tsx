import { createFileRoute } from '@tanstack/react-router'
import { OperationsScreen } from '../features/game-screens'
export const Route = createFileRoute('/u/$universe/galaxy')({
  staticData: { page: 'galaxy' },
  component: OperationsScreen,
})
