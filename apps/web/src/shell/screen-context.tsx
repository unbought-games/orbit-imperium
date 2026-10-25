import { createContext, useContext } from 'react'
import type { DispatchDraft } from '../features/missions'
import type { Route } from './routes'
import type { GameSession } from './session-context'
export type GameScreenContext = GameSession & {
  prepareDispatch: (draft: DispatchDraft) => void
  route: Route
  body: GameSession['view']['bodies'][number] | undefined
}
export const ScreenContext = createContext<GameScreenContext | null>(null)
export function useGameScreen() {
  const context = useContext(ScreenContext)
  if (!context) throw new Error('Game screens require an accessible route.')
  return context
}
