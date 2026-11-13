import { createFileRoute } from '@tanstack/react-router'
import { SettingsIndexScreen } from '../features/settings-index'

export const Route = createFileRoute('/u/$universe/settings')({
  staticData: { page: 'settings' },
  component: SettingsIndexScreen,
})
