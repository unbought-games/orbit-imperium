import { expect, it } from 'vitest'
import { copyGameInvitation, invitationMatches } from './invitation-sharing'
import fixture from '../../../../contracts/fixtures/community-owner.json'
import type {
  CommunityOwner,
  CommunityAction,
} from '../adapters/community-rewards'

const owner = structuredClone(fixture) as CommunityOwner
const invitation = owner.invitations[0]
it('one copy action creates when needed and subsequent sharing reuses the same invitation', async () => {
  const actions: CommunityAction[] = [],
    copied: string[] = []
  const controller = {
    act: async (action: CommunityAction) => {
      actions.push(action)
      return {
        contract_version: 1 as const,
        result: { code: invitation.code },
        owner,
      }
    },
  }
  const options = {
    kind: 'personal' as const,
    origin: 'https://orbit.example.test',
    controller,
    copy: async (url: string) => {
      copied.push(url)
    },
  }
  expect(await copyGameInvitation(options)).toEqual({
    code: invitation.code,
    status: 'copied',
  })
  expect(
    await copyGameInvitation({ ...options, existing: invitation }),
  ).toEqual({ code: invitation.code, status: 'copied' })
  expect(actions).toEqual([
    { type: 'create_invitation', kind: 'personal', game_id: 'orbit-imperium' },
  ])
  expect(copied).toEqual([invitation.url, invitation.url])
})
it('clipboard rejection preserves the created invitation for the visible selectable-link fallback', async () => {
  const result = await copyGameInvitation({
    existing: invitation,
    kind: 'personal',
    origin: 'https://orbit.example.test',
    controller: {
      act: async () => {
        throw Error('must reuse')
      },
    },
    copy: async () => {
      throw Error('clipboard denied')
    },
  })
  expect(result).toEqual({ code: invitation.code, status: 'select' })
})
it('alliance reuse matches the game and complete universe, epoch and alliance identity', () => {
  const alliance = {
    universe_id: 'universe',
    epoch_id: 'epoch',
    alliance_id: 'alliance',
  }
  const combined = { ...invitation, kind: 'combined' as const, alliance }
  expect(invitationMatches(combined, 'combined', alliance)).toBe(true)
  expect(
    invitationMatches(
      { ...combined, game_id: 'other-game' },
      'combined',
      alliance,
    ),
  ).toBe(false)
  for (const field of ['universe_id', 'epoch_id', 'alliance_id'] as const)
    expect(
      invitationMatches(
        { ...combined, alliance: { ...alliance, [field]: 'different' } },
        'combined',
        alliance,
      ),
    ).toBe(false)
  expect(invitationMatches(combined, 'alliance_public', alliance)).toBe(false)
})
