import { createFileRoute } from '@tanstack/react-router'
import { ProtectedGame } from '../shell/protected-game'
export const Route = createFileRoute('/$')({
  staticData: { page: null },
  component: ProtectedGame,
})
