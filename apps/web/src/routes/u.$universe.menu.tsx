import { createFileRoute } from '@tanstack/react-router'
import { MenuScreen } from '../features/menu'

export const Route = createFileRoute('/u/$universe/menu')({
  staticData: { page: 'menu' },
  component: MenuScreen,
})
