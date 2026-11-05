import { createFileRoute } from '@tanstack/react-router'
import { HighScoresScreen } from '../features/high-scores'

export const Route = createFileRoute('/u/$universe/high-scores')({
  staticData: { page: 'high-scores' },
  component: HighScoresScreen,
})
