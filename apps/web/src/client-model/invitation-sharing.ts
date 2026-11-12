import type { CommunityOwner } from '../adapters/community-rewards'
import type { CommunityRewardsController } from './community-rewards'
import { invitationShareUrl } from './invitation-entry'
type Invitation = CommunityOwner['invitations'][number]
export type InvitationShareStatus = {
  code: string
  status: 'copied' | 'select' | 'unavailable'
}

export function invitationMatches(
  invitation: Invitation,
  kind: Invitation['kind'],
  alliance?: NonNullable<Invitation['alliance']>,
  universe?: string,
) {
  return (
    invitation.game_id === 'orbit-imperium' &&
    !!universe &&
    invitation.destination?.universe_id === universe &&
    invitation.kind === kind &&
    (alliance
      ? invitation.alliance?.universe_id === alliance.universe_id &&
        invitation.alliance?.epoch_id === alliance.epoch_id &&
        invitation.alliance?.alliance_id === alliance.alliance_id
      : invitation.alliance === null)
  )
}

/** One share action creates only when needed; clipboard denial leaves a usable URL. */
export async function copyGameInvitation({
  existing,
  universe,
  kind,
  alliance,
  origin,
  entryPath,
  controller,
  copy,
}: {
  existing?: Invitation
  universe: string
  kind: Invitation['kind']
  alliance?: NonNullable<Invitation['alliance']>
  origin: string
  entryPath?: string
  controller: Pick<CommunityRewardsController, 'act'>
  copy: (url: string) => Promise<void>
}): Promise<InvitationShareStatus | undefined> {
  let invitation = existing
  if (!invitation) {
    const response = await controller.act({
      type: 'create_invitation',
      kind,
      game_id: 'orbit-imperium',
      universe_id: universe,
      ...(alliance ? { alliance } : {}),
    })
    if (!response) return
    invitation = response.owner.invitations.find(
      (item) => item.code === response.result.code,
    )
  }
  if (!invitation) return
  if (!invitationMatches(invitation, kind, alliance, universe))
    return { code: invitation.code, status: 'unavailable' }
  const url = invitationShareUrl(invitation, origin, entryPath)
  if (!url) return { code: invitation.code, status: 'unavailable' }
  try {
    await copy(url)
    return { code: invitation.code, status: 'copied' }
  } catch {
    return { code: invitation.code, status: 'select' }
  }
}
