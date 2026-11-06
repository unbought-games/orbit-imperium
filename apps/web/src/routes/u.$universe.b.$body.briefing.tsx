import { createFileRoute } from '@tanstack/react-router'
import { TutorialBriefing } from '../features/tutorial/tutorial'

export const Route = createFileRoute('/u/$universe/b/$body/briefing')({
  staticData: { page: 'briefing' },
  component: TutorialBriefing,
})
