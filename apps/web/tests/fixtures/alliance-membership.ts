import type { components } from '../../src/contracts'
import { id } from '../../src/test-support/bootstrap'
import { permissionLabels } from '../../src/client-model/alliances'
type S = components['schemas']
export function allianceMembershipFixture(
  binding: Pick<S['Binding'], 'player' | 'universe'>,
) {
  const alliance = id(800),
    applicant = id(810),
    member = id(820)
  const summary: S['AllianceSummary'] = {
    id: alliance,
    universe: binding.universe,
    name: 'Starlight Assembly',
    tag: 'STAR',
    recruitment: 'Application',
    member_count: 2,
    ranking: {
      rank: 3,
      points: '24000',
      average_points: '12000',
      previous_rank: 4,
      baseline_at: 1700000000000,
    },
  }
  const baseRole: S['AllianceRole'] = {
    id: id(830),
    name: 'Member',
    is_default: true,
    permissions: ['ViewMembers', 'PublishPosts'],
    grantable_permissions: [],
  }
  const permissions = Object.keys(permissionLabels) as S['AlliancePermission'][]
  function own(): S['AllianceDetail'] {
    return {
      summary: { ...summary },
      public_text: '**Together** among the stars.',
      revision: 1,
      leader: binding.player,
      permissions: [...permissions],
      grantable_permissions: [...permissions],
      roles: [{ ...baseRole }],
      members: [
        {
          player: binding.player,
          username: 'Commander',
          joined_at: 1700000000000,
          roles: [baseRole.id],
          activity: 'Recent',
        },
        {
          player: member,
          username: 'Nova',
          joined_at: 1700000000000,
          roles: [baseRole.id],
          activity: 'Away',
        },
      ],
      applications: [
        {
          id: applicant,
          alliance,
          alliance_tag: 'STAR',
          player: id(840),
          username: 'New Pilot',
          text: 'Ready to explore.',
          created_at: 1700000000000,
        },
      ],
      posts: [
        {
          id: id(850),
          author: member,
          author_name: 'Nova',
          title: 'Welcome aboard',
          body: 'Our **first** chapter.',
          created_at: 1700000000000,
          updated_at: 1700000000000,
          pinned: false,
        },
      ],
      next_post_before: null,
      audit: [
        {
          id: id(860),
          actor: binding.player,
          actor_name: 'Commander',
          action: 'Created alliance',
          at: 1700000000000,
          target: null,
        },
      ],
    }
  }
  return { alliance, applicant, member, summary, baseRole, permissions, own }
}
