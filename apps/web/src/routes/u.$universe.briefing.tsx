import { createFileRoute } from '@tanstack/react-router'
import { TutorialBriefing } from '../features/tutorial/tutorial'
import { validateBodySearch } from '../shell/routes'

export const Route = createFileRoute('/u/$universe/briefing')({
  staticData: { page: 'briefing' },
  validateSearch: validateBodySearch,
  component: TutorialBriefing,
})
