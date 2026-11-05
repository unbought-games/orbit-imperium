import { createFileRoute } from '@tanstack/react-router'
import { CombatSimulator } from '../features/combat-simulation'

export const Route = createFileRoute('/u/$universe/combat-simulator')({
  staticData: { page: 'combat-simulator' },
  component: CombatSimulator,
})
