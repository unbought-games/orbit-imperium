import { createContext, useContext } from 'react'
import type { useAppSession } from '../client-model/use-app-session'

type AuthSession = Pick<
  ReturnType<typeof useAppSession>,
  'runtime' | 'busy' | 'message' | 'errorRef' | 'login' | 'clearMessage'
>
export const AuthContext = createContext<AuthSession | null>(null)
export function useAuthSession() {
  const session = useContext(AuthContext)
  if (!session)
    throw new Error('Public routes require an authentication session.')
  return session
}
