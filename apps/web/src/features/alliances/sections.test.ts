import { expect, it } from 'vitest'
import type { AllianceDetail } from '../../client-model/alliances'
import { allianceSections } from './sections'
const detail: AllianceDetail = {
  summary: {
    id: 'alliance',
    universe: 'u',
    name: 'Starlight',
    tag: 'STAR',
    member_count: 2,
    recruitment: 'Application',
  },
  public_text: '',
  revision: 1,
  leader: 'p',
  permissions: ['ViewMembers', 'ViewApplications', 'ManageRoles', 'ViewAudit'],
  grantable_permissions: [],
  roles: [],
}
it('a leadership transfer removes administration destinations while preserving member destinations', () => {
  expect(allianceSections(detail)).toEqual([
    'Board',
    'Members',
    'Applications',
    'Roles',
    'Settings',
    'Audit',
  ])
  expect(
    allianceSections({
      ...detail,
      permissions: ['ViewMembers', 'PublishPosts'],
      grantable_permissions: [],
    }),
  ).toEqual(['Board', 'Members', 'Settings'])
})
it('an assignment-only manager can inspect supplied roles without acquiring other management destinations', () => {
  expect(allianceSections({ ...detail, permissions: ['AssignRoles'] })).toEqual(
    ['Board', 'Roles', 'Settings'],
  )
  expect(
    allianceSections({
      ...detail,
      permissions: ['AssignRoles'],
      roles: undefined,
    }),
  ).toEqual(['Board', 'Settings'])
})
it('missing membership exposes no private navigation', () => {
  expect(allianceSections(null)).toEqual([])
})
