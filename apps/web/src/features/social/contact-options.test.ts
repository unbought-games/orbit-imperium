import { expect, it } from 'vitest'
import { contactOptions } from './contact-options'
import type { SocialContact } from '../../client-model/social'
const contact: SocialContact = {
  player: 'nova',
  username: 'Nova',
  blocked: false,
  request: null,
  requested_by: null,
  accepted: false,
}
it('offers friend and block actions for a new contact', () => {
  expect(contactOptions(contact, 'self')).toEqual([
    { label: 'Add friend', action: { type: 'RequestFriend', player: 'nova' } },
    { label: 'Block player', action: { type: 'Block', player: 'nova' } },
  ])
})
it('distinguishes incoming, outgoing and accepted friend requests', () => {
  const pending = { ...contact, request: 'request-id', requested_by: 'nova' }
  expect(contactOptions(pending, 'self').map((o) => o.label)).toEqual([
    'Accept friend',
    'Decline request',
    'Block player',
  ])
  expect(
    contactOptions({ ...pending, requested_by: 'self' }, 'self')[0],
  ).toEqual({
    label: 'Cancel request',
    action: { type: 'RemoveFriend', player: 'nova', request: 'request-id' },
  })
  expect(
    contactOptions({ ...pending, accepted: true }, 'self').map((o) => o.label),
  ).toEqual(['Remove friend', 'Block player'])
})
it('only offers unblock for a blocked contact with no friendship', () => {
  expect(contactOptions({ ...contact, blocked: true }, 'self')).toEqual([
    { label: 'Unblock player', action: { type: 'Unblock', player: 'nova' } },
  ])
})
