import { createFileRoute } from '@tanstack/react-router'
import { ProtectedGame } from '../shell/protected-game'
import { InvalidRoute } from '../shell/invalid-route'
import { validateBodySearch } from '../shell/routes'
export const Route = createFileRoute('/u/$universe')({
  component: ProtectedGame,
  // Legacy entry points still validate explicit planet context before the shell
  // checks access and replaces it with the canonical path. Never ignore a bad ID.
  validateSearch: validateBodySearch,
  errorComponent: InvalidRoute,
})
