import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { DispatchReviewSession } from '../features/dispatch-review-session'

import { useGameSession } from './session-context'

const Context = createContext<DispatchReviewSession | null>(null)
export function DispatchSessionProvider({ children }: { children: ReactNode }) {
  const { model } = useGameSession()
  const session = useMemo(() => new DispatchReviewSession(), [model])
  return (
    <Context.Provider key={session.id} value={session}>
      {children}
    </Context.Provider>
  )
}
export function useDispatchSession() {
  const session = useContext(Context)
  if (!session) throw Error('Dispatch requires a game session.')
  return session
}
