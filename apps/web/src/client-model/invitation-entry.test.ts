import { expect, it } from 'vitest'
import {
  allianceInvitationContinuation,
  invitationEntryPath,
  invitationReturnPath,
  invitationShareUrl,
  invitationContinuation,
} from './invitation-entry'
import { oidcLoginPath } from './use-oidc'
import { validateAuthSearch } from '../shell/auth-search'
import { validate } from './schema'

const continuation =
  '/invite/00000000-0000-4000-8000-000000000003/00000000-0000-4000-8000-000000000004'
it('preserves the exact game invitation through sign-in and new-account entry', () => {
  const path = invitationEntryPath('inv_A-b_9', continuation)!
  for (const signup of [false, true]) {
    const url = new URL(
      oidcLoginPath(path, false, signup),
      'https://orbit.example',
    )
    expect(url.pathname).toBe('/api/auth/login')
    expect(url.searchParams.get('return_to')).toBe(path)
    expect(url.searchParams.get('signup')).toBe(signup ? 'true' : null)
  }
  expect(validateAuthSearch({ redirect: path })).toEqual({ redirect: path })
  expect(validateAuthSearch({ redirect: '/invitations' })).toEqual({
    redirect: '/invitations',
  })
  expect(oidcLoginPath(path, true, true)).not.toContain('signup=')
})
it('allows only local native alliance destinations and rejects forged return routes', () => {
  for (const value of [
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    '/login',
    '/invite/../evil',
    `${continuation}?redirect=//evil.example`,
  ]) {
    expect(allianceInvitationContinuation(value)).toBeUndefined()
    expect(invitationEntryPath('inv_safe', value)).toBe('/invite/inv_safe')
  }
  for (const path of [
    '/invite/%2f%2fevil.example',
    '/invite/%0aevil',
    '/invite/%',
    'https://evil.example/invite/code',
    '//evil.example/invite/code',
  ])
    expect(invitationReturnPath(path)).toBeUndefined()
  expect(
    invitationReturnPath('/invite/code?continue=https://evil.example'),
  ).toBe('/invite/code')
  expect(invitationEntryPath('../code')).toBeUndefined()
})
it('uses only the canonical current-game URL while preserving native alliance admission', () => {
  const invitation = {
    code: 'inv_sample',
    game_id: 'orbit-imperium',
    url: 'https://orbit.example/invite/inv_sample',
  }
  expect(invitationShareUrl(invitation, 'https://orbit.example')).toBe(
    invitation.url,
  )
  const url = new URL(
    invitationShareUrl(invitation, 'https://orbit.example', continuation)!,
  )
  expect(url.pathname).toBe(continuation)
  expect(url.searchParams.get('rewards_invitation')).toBe('inv_sample')
  const alliance = {
    universe_id: '00000000-0000-4000-8000-000000000003',
    alliance_id: '00000000-0000-4000-8000-000000000008',
  }
  expect(invitationContinuation(undefined, alliance)).toBe(
    `/alliances/${alliance.universe_id}/${alliance.alliance_id}`,
  )
  expect(invitationContinuation(continuation, alliance)).toBe(continuation)
  expect(invitationContinuation(undefined, null)).toBe('/')
  for (const changed of [
    { game_id: 'other-game' },
    { url: 'https://accounts.example/invite/inv_sample' },
    { url: 'https://untrusted@orbit.example/invite/inv_sample' },
    { url: 'https://orbit.example/invite/someone-else' },
    { url: 'https://orbit.example/invite/inv_sample?redirect=elsewhere' },
  ])
    expect(
      invitationShareUrl(
        { ...invitation, ...changed },
        'https://orbit.example',
      ),
    ).toBeUndefined()
})
it('requires the Orbit game for personal and alliance invitation actions', () => {
  for (const kind of ['personal', 'combined', 'alliance_public']) {
    const body = {
      contract_version: 1,
      request_id: 'request-1',
      action: {
        type: 'create_invitation',
        kind,
        game_id: 'orbit-imperium',
        ...(kind === 'personal'
          ? {}
          : {
              alliance: {
                universe_id: 'universe',
                epoch_id: 'epoch',
                alliance_id: 'alliance',
              },
            }),
      },
    }
    expect(validate('CommunityActionRequest', body)).toEqual(body)
    for (const game_id of [undefined, 'other-game', null])
      expect(() =>
        validate('CommunityActionRequest', {
          ...body,
          action: { ...body.action, game_id },
        }),
      ).toThrow()
  }
})
