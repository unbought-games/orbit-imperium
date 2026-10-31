import type { SocialAction, SocialContact } from '../../client-model/social'

type ContactAction = Extract<
  SocialAction,
  {
    type:
      | 'RequestFriend'
      | 'AcceptFriend'
      | 'RemoveFriend'
      | 'Block'
      | 'Unblock'
  }
>

export function contactOptions(
  contact: SocialContact,
  self: string,
): { label: string; action: ContactAction }[] {
  const options: { label: string; action: ContactAction }[] = []
  const player = contact.player
  if (!contact.blocked && !contact.request)
    options.push({
      label: 'Add friend',
      action: { type: 'RequestFriend', player },
    })
  if (contact.request) {
    const request = contact.request
    if (!contact.accepted && contact.requested_by !== self)
      options.push({
        label: 'Accept friend',
        action: { type: 'AcceptFriend', player, request },
      })
    options.push({
      label: contact.accepted
        ? 'Remove friend'
        : contact.requested_by === self
          ? 'Cancel request'
          : 'Decline request',
      action: { type: 'RemoveFriend', player, request },
    })
  }
  options.push({
    label: contact.blocked ? 'Unblock player' : 'Block player',
    action: { type: contact.blocked ? 'Unblock' : 'Block', player },
  })
  return options
}
