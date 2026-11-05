import { createFileRoute } from '@tanstack/react-router'
import { SettingsScreen } from '../features/game-screens'

export const Route = createFileRoute('/u/$universe/b/$body/settings')({
  staticData: { page: 'settings' },
  component: SettingsScreen,
})
