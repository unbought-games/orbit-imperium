import { createContext, useContext } from 'react'
import type { useCommands } from '../client-model/use-commands'
import type { BoundView } from '../client-model/commands'
import type { Coordinator } from '../client-model/coordinator'
export type GameSession = {
  commands: ReturnType<typeof useCommands>
  view: BoundView
  model: Coordinator
  logout: () => Promise<void>
}
export const SessionContext = createContext<GameSession | null>(null)
export function useGameSession() {
  const session = useContext(SessionContext)
  if (!session) throw new Error('Game routes require a confirmed session.')
  return session
}
