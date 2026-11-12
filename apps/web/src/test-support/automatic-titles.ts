import type { CommunityOwner } from '../adapters/community-rewards'
import type { components } from '../contracts'
import fixture from '../../../../contracts/fixtures/community-owner.json' with { type: 'json' }

// Independently authored free test content, unrelated to the hosted program.
export function automaticTitlesFixture(): CommunityOwner {
  const owner = structuredClone(fixture) as CommunityOwner
  const base = owner.milestones[0]
  const title = (
    id: string,
    name: string,
    owned: boolean,
  ): components['schemas']['CommunityRewardOption'] => ({
    id: `fixture:title:${id}`,
    name,
    kind: 'title',
    scope: 'game',
    game_id: 'orbit-imperium',
    item_id: id,
    access: 'free',
    tier: 'standard',
    surfaces: ['title'],
    supported_games: ['orbit-imperium'],
    preview: {},
    payload: { type: 'title', content_id: id },
    owned,
    supported: true,
  })
  owner.milestones = [
    {
      ...base,
      id: 'sample-claimed',
      threshold: 1,
      selections: 1,
      remaining: 0,
      options: [],
      automatic_titles: [title('sample-pathfinder', 'Sample Pathfinder', true)],
    },
    {
      ...base,
      automatic_titles: [title('sample-stargazer', 'Sample Stargazer', true)],
    },
    {
      ...base,
      id: 'sample-locked',
      threshold: 5,
      selections: 1,
      remaining: 1,
      unlocked: false,
      automatic_titles: [title('sample-voyager', 'Sample Voyager', false)],
    },
  ]
  owner.next_milestone = owner.milestones[2]
  owner.collection = owner.milestones.flatMap((milestone) =>
    (milestone.automatic_titles ?? []).flatMap((title) => {
      const { owned, supported, ...reward } = title
      if (!owned) return []
      return {
        reward_id: title.id,
        reward,
        permanent: true,
        membership_access: false,
        supported,
        delivery: 'delivered' as const,
      }
    }),
  )
  return owner
}
