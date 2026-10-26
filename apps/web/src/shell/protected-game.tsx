import { universeSlug } from '../client-model/universe-name'
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
  // Public recruitment URLs carry stable universe IDs. Resolve only this
  // explicit entry point to the current name after authentication.
  const allianceEntry = /^\/u\/([0-9a-f-]{36})\/alliance(?:\?|$)/i.exec(href)
  if (allianceEntry && runtime.status === 'authenticated') {
    const membership = runtime.session.memberships.find(
      (m) => m.universe === allianceEntry[1],
    )
    if (membership)
      return (
        <Navigate
          to="/u/$universe/alliance"
          params={{ universe: universeSlug(membership.universe_name) }}
          search={{
            alliance:
              new URLSearchParams(href.split('?')[1]).get('alliance') ??
              undefined,
          }}
          replace
        />
      )
  }
  return <GameShell />
}
