import { createFileRoute } from '@tanstack/react-router'
import { EconomyScreen } from '../features/game-screens'
export const Route = createFileRoute('/u/$universe/research')({
  staticData: { page: 'research' },
  component: EconomyScreen,
})
