import { Navigate, useLocation } from '@tanstack/react-router'
import { useAuthSession } from './auth-context'
import { GameShell } from './game-shell'
import { InvalidRoute } from './invalid-route'

export function ProtectedGame() {
  const { runtime } = useAuthSession()
  const href = useLocation({ select: (location) => location.href })
  if (runtime.status === 'anonymous') {
    if (href === '/index.html') return <Navigate to="/" replace />
    return href.startsWith('/u/') ? (
      <Navigate to="/login" search={{ redirect: href }} replace />
    ) : (
      <InvalidRoute />
    )
  }
  return <GameShell />
}
