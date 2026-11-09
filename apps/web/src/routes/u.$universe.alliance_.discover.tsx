import { createFileRoute } from '@tanstack/react-router'
import { AllianceScreen } from '../features/alliances/screen'
import { validateAllianceSearch } from '../shell/page-search'

export const Route = createFileRoute('/u/$universe/alliance_/discover')({
  staticData: { page: 'alliance-discover' },
  validateSearch: validateAllianceSearch,
  component: () => <AllianceScreen discovering />,
})
