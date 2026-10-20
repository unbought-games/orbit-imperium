import { createFileRoute } from '@tanstack/react-router'
import { EconomyScreen } from '../features/game-screens'
export const Route = createFileRoute('/u/$universe/b/$body/resources')({
  staticData: { page: 'resources' },
  component: EconomyScreen,
})
