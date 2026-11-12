import { createFileRoute } from '@tanstack/react-router'
import { RewardsScreen } from '../features/rewards/rewards-screen'
export const Route = createFileRoute('/u/$universe/rewards')({
  staticData: { page: 'rewards' },
  component: RewardsScreen,
})
