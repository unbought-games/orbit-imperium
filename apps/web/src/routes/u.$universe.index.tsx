import { createFileRoute } from '@tanstack/react-router'
import { OverviewScreen } from '../features/game-screens'
export const Route = createFileRoute('/u/$universe/')({
  staticData: { page: 'overview' },
  component: OverviewScreen,
})
