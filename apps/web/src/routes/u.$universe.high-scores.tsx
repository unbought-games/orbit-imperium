import { createFileRoute } from '@tanstack/react-router'
import { HighScoresScreen } from '../features/high-scores'
import { validateBodySearch } from '../shell/routes'

export const Route = createFileRoute('/u/$universe/high-scores')({
  staticData: { page: 'high-scores' },
  validateSearch: validateBodySearch,
  component: HighScoresScreen,
})
