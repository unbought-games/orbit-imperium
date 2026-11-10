import { describe, expect, it } from 'vitest'
import type { AllianceDetail } from '../../client-model/alliances'
import { memberRoleOptions, rosterEntries } from './roster-model'
const detail: AllianceDetail = {
  summary: {
    id: 'alliance',
    universe: 'universe',
    tag: 'STAR',
    name: 'Starlight',
    member_count: 3,
    recruitment: 'Open',
  },
  public_text: '',
  revision: 1,
  permissions: ['ViewMembers', 'AssignRoles'],
  leader: 'leader',
  grantable_permissions: ['ViewMembers', 'PublishPosts'],
  roles: [
    {
      id: 'member',
      name: 'Member',
      is_default: true,
      permissions: ['ViewMembers'],
      grantable_permissions: [],
    },
    {
      id: 'scout',
      name: 'Scout',
      is_default: false,
      permissions: ['ViewMembers'],
      grantable_permissions: [],
    },
    {
      id: 'writer',
      name: 'Writer',
      is_default: false,
      permissions: ['PublishPosts'],
      grantable_permissions: [],
    },
    {
      id: 'officer',
      name: 'Officer',
      is_default: false,
      permissions: ['ManageRoles'],
      grantable_permissions: [],
    },
  ],
  members: [
    { player: 'b', username: 'Beta', roles: ['member'], joined_at: 0 },
    {
      player: 'a',
      username: 'Alpha',
      roles: ['member', 'scout', 'writer'],
      joined_at: 0,
    },
    { player: 'leader', username: 'Zeta', roles: ['member'], joined_at: 0 },
  ],
}

describe('compact roster presentation', () => {
  it('puts the leader first, alphabetizes members and derives concise role labels without mutating the source', () => {
    const before = structuredClone(detail)
    const rows = rosterEntries(detail)
    expect(rows.map((r) => [r.member.username, r.roleLabel])).toEqual([
      ['Zeta', 'Leader'],
      ['Alpha', 'Scout · Writer'],
      ['Beta', 'Member'],
    ])
    expect(detail).toEqual(before)
  })
  it('keeps undelegable roles locked, including authority granted by a role', () => {
    const member = { ...detail.members![0], roles: ['officer'] }
    const { assignable, locked } = memberRoleOptions(detail, member)
    expect(assignable.map((r) => r.id)).toEqual(['scout', 'writer'])
    expect(locked.map((r) => r.id)).toEqual(['officer'])
    expect(
      memberRoleOptions(
        {
          ...detail,
          roles: [
            {
              id: 'delegator',
              name: 'Delegator',
              is_default: false,
              permissions: ['ViewMembers'],
              grantable_permissions: ['KickMembers'],
            },
          ],
        },
        { ...member, roles: ['delegator'] },
      ).locked.map((r) => r.id),
    ).toEqual(['delegator'])
  })
})
