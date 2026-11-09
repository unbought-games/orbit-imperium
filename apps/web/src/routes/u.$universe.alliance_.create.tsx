import { createFileRoute } from '@tanstack/react-router'
import { AllianceScreen } from '../features/alliances/screen'

export const Route = createFileRoute('/u/$universe/alliance_/create')({
  staticData: { page: 'alliance-create' },
  component: () => <AllianceScreen creating />,
})
