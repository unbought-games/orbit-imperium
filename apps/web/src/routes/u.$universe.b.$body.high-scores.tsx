import { createFileRoute } from '@tanstack/react-router'
import { HighScoresScreen } from '../features/high-scores'

export const Route = createFileRoute('/u/$universe/b/$body/high-scores')({
  staticData: { page: 'high-scores' },
  component: HighScoresScreen,
})
