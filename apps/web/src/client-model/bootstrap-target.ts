import type { Bootstrap } from './bootstrap'
import { universeSlug } from './universe-name'
export function bootstrapTarget(pathname: string): string | undefined {
  const target = /^\/u\/([^/]+)(?:\/|$)/.exec(pathname)?.[1]
  return target && /^[A-Za-z0-9~-]{1,800}$/.test(target) ? target : undefined
}
export function embeddedForDestination(
  value: Bootstrap | null,
  pathname: string,
): Bootstrap | null {
  const target = bootstrapTarget(pathname)
  if (!target || !value || value.result.status !== 'authenticated') return value
  const member = value.result.session.memberships.find(
    (m) => m.universe === target || universeSlug(m.universe_name) === target,
  )
  if (!member || value.result.game.status !== 'ready') return value
  return value.result.game.snapshot.candidate.binding.universe ===
    member.universe
    ? value
    : null
}
