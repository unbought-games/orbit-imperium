import { createFileRoute } from '@tanstack/react-router'
import { ProtectedGame } from '../shell/protected-game'
import { InvalidRoute } from '../shell/invalid-route'
import { validateBodySearch } from '../shell/routes'
export const Route = createFileRoute('/u/$universe')({
  component: ProtectedGame,
  validateSearch: validateBodySearch,
  errorComponent: InvalidRoute,
})
