import { createFileRoute } from '@tanstack/react-router'
import { CombatSimulator } from '../features/combat-simulation'
import { validateBodySearch } from '../shell/routes'

export const Route = createFileRoute('/u/$universe/combat-simulator')({
  staticData: { page: 'combat-simulator' },
  validateSearch: validateBodySearch,
  component: CombatSimulator,
})
