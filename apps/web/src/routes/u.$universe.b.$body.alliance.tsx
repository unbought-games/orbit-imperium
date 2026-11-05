import { createFileRoute } from '@tanstack/react-router'
import { AllianceScreen } from '../features/alliances/screen'
import { validateAllianceSearch } from '../shell/page-search'

export const Route = createFileRoute('/u/$universe/b/$body/alliance')({
  staticData: { page: 'alliance' },
  validateSearch: validateAllianceSearch,
  component: AllianceScreen,
})
