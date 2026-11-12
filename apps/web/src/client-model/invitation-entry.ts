/** Invitation entry is game-local. Never accept an arbitrary post-login destination. */
import type { GameInvitationPresentation } from '../adapters/community-rewards'
import { universeSlug } from './universe-name'

export function boundInvitationPath(
  preview: GameInvitationPresentation,
  continuation?: unknown,
): string {
  if (!preview.universe) return '/'
  const native = allianceInvitationContinuation(continuation)
  if (
    native &&
    native.split('/')[2].toLowerCase() === preview.universe.id.toLowerCase()
  )
    return native
  if (preview.alliance?.universe_id === preview.universe.id)
    return `/alliances/${preview.universe.id}/${preview.alliance.id}`
  return `/u/${universeSlug(preview.universe.name)}`
}
export const invitationCode = (code: string) =>
  /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/.test(code)

export function allianceInvitationContinuation(
  value: unknown,
): string | undefined {
  if (typeof value !== 'string') return
  const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
  return new RegExp(`^/(invite|alliances)/${uuid}/${uuid}$`, 'i').test(value)
    ? value
    : undefined
}

export function invitationEntryPath(code: string, continuation?: unknown) {
  if (!invitationCode(code)) return undefined
  const next = allianceInvitationContinuation(continuation)
  return `/invite/${encodeURIComponent(code)}${next ? `?${new URLSearchParams({ continue: next })}` : ''}`
}

export function invitationContinuation(
  continuation: unknown,
  alliance: { universe_id: string; alliance_id: string } | null | undefined,
): string {
  return (
    allianceInvitationContinuation(continuation) ??
    (alliance
      ? allianceInvitationContinuation(
          `/alliances/${alliance.universe_id}/${alliance.alliance_id}`,
        )
      : undefined) ??
    '/'
  )
}

export function invitationReturnPath(value: unknown): string | undefined {
  if (value === '/invitations') return value
  if (typeof value !== 'string' || !value.startsWith('/invite/')) return
  if (
    Array.from(value).some(
      (character) =>
        character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    ) ||
    value.includes('\\')
  )
    return
  try {
    const url = new URL(value, 'https://orbit.invalid')
    if (url.origin !== 'https://orbit.invalid') return
    const match = /^\/invite\/([^/]+)\/?$/.exec(url.pathname)
    return match
      ? invitationEntryPath(
          decodeURIComponent(match[1]),
          url.searchParams.get('continue'),
        )
      : undefined
  } catch {
    return undefined
  }
}

export function invitationShareUrl(
  invitation: { code: string; game_id: string; url: string },
  origin: string,
  continuation?: string,
): string | undefined {
  const path = invitationEntryPath(invitation.code)
  if (invitation.game_id !== 'orbit-imperium' || !path) return
  try {
    const url = new URL(invitation.url)
    if (
      url.origin !== origin ||
      url.pathname !== path ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      return
    const native = allianceInvitationContinuation(continuation)
    if (native) {
      const link = new URL(native, origin)
      link.searchParams.set('rewards_invitation', invitation.code)
      return link.href
    }
    return url.href
  } catch {
    return undefined
  }
}
