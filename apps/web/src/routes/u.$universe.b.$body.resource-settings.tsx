import { createFileRoute } from '@tanstack/react-router'
import { ResourceSettingsScreen } from '../features/game-screens'
export const Route = createFileRoute('/u/$universe/b/$body/resource-settings')({
  staticData: { page: 'resource-settings' },
  component: ResourceSettingsScreen,
})
