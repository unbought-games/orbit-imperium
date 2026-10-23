import { createFileRoute } from '@tanstack/react-router'
import { OperationsScreen } from '../features/game-screens'
export const Route = createFileRoute('/u/$universe/b/$body/dispatch')({
  staticData: { page: 'dispatch' },
  component: OperationsScreen,
})
