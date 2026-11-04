import { createFileRoute } from '@tanstack/react-router'
import { AllianceScreen } from '../features/alliances/screen'
import { validateBodySearch } from '../shell/routes'
import { allianceSearch } from '../client-model/recruitment'
export const Route = createFileRoute('/u/$universe/alliance')({
  staticData: { page: 'alliance' },
  validateSearch: (search: Record<string, unknown>) => ({
    ...validateBodySearch(search),
    ...allianceSearch(search),
  }),
  component: AllianceScreen,
})
