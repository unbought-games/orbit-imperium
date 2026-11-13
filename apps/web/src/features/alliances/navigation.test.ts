import { expect, it } from 'vitest'
import { allianceDestination, sameAllianceWorkspace } from './navigation'
import type { AllianceDetail } from '../../client-model/alliances'

it('derives the visible destination from the URL and current permissions', () => {
  const detail = {
    permissions: ['ViewMembers'],
    leader: 'leader',
  } as AllianceDetail
  expect(allianceDestination('members', detail).active).toBe('Members')
  expect(allianceDestination('audit', detail).active).toBe('Hall')
  expect(allianceDestination('settings/recruitment', detail)).toEqual({
    active: 'Settings',
    settingsSection: 'Recruitment',
  })
  expect(allianceDestination(null, null).active).toBe('Hall')
})
it('only keeps authored drafts when navigation retains the mounted alliance workspace', () => {
  const current = '/u/andromeda/b/earth/alliance/settings/identity'
  for (const path of ['alliance', 'alliance/hall', 'alliance/settings/media'])
    expect(sameAllianceWorkspace(current, `/u/andromeda/b/earth/${path}`)).toBe(
      true,
    )
  for (const path of [
    '/u/andromeda/b/earth/alliance/discover',
    '/u/andromeda/b/earth/alliance/create',
    '/u/andromeda/b/mars/alliance/settings/media',
    '/u/other/b/earth/alliance',
    '/u/andromeda/b/earth/alliance/unknown',
    '/u/andromeda/b/earth/resources',
  ])
    expect(sameAllianceWorkspace(current, path)).toBe(false)
})
