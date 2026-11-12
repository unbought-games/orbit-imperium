import { HttpError } from '../adapters/http'
import { describe, expect, it } from 'vitest'
import {
  CommunityRewardsController,
  pendingChoices,
  rewardsVisible,
} from './community-rewards'
import type {
  CommunityActionRequest,
  CommunityOwner,
  communityRewardsApi,
} from '../adapters/community-rewards'
import fixture from '../../../../contracts/fixtures/community-owner.json'
import { validate } from './schema'
const owner = () => structuredClone(fixture) as CommunityOwner
const deferred = <T>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}
const api = (
  changes: Partial<ReturnType<typeof communityRewardsApi>>,
): ReturnType<typeof communityRewardsApi> => ({
  owner: async () => owner(),
  act: async () => ({ contract_version: 1, result: {}, owner: owner() }),
  invitation: async () => {
    throw Error('unused')
  },
  invitationPreview: async () => {
    throw Error('unused')
  },
  marks: async () => ({ marks: [], expires_at: 0 }),
  allianceHonors: async () => ({ alliance_id: '', honors: [] }),
  ...changes,
})
describe('rewards request authority', () => {
  it('accepts the shared free fixture and gates navigation until activation', () => {
    expect(validate('CommunityOwner', fixture)).toEqual(fixture)
    const data = owner()
    expect(rewardsVisible(data)).toBe(true)
    data.program.status = 'inactive'
    expect(rewardsVisible(data)).toBe(false)
    data.program.status = 'paused'
    expect(rewardsVisible(data)).toBe(true)
    data.program.start_at = null
    expect(rewardsVisible(data)).toBe(false)
    expect(rewardsVisible({ enabled: false })).toBe(false)
    expect(pendingChoices(owner())).toHaveLength(1)
  })
  it('retries an uncertain action with its original identity and excludes a second action', async () => {
    const calls: CommunityActionRequest[] = []
    let fail = true
    const controller = new CommunityRewardsController(
      api({
        act: async (request) => {
          calls.push(request)
          if (fail) throw Error('connection lost')
          const data = owner()
          data.milestones[0].remaining = 1
          return { contract_version: 1, result: {}, owner: data }
        },
      }),
      () => {},
      () => 'fixed-request',
    )
    const action = {
      type: 'claim' as const,
      milestone_id: 'sample-step',
      reward_id: 'fixture:dye:ochre',
      offer_version: 'sample-offer-v1',
    }
    await controller.act(action)
    expect(controller.store.getState().pending?.request_id).toBe(
      'fixed-request',
    )
    await controller.act({ ...action, reward_id: 'fixture:dye:teal' })
    expect(calls).toHaveLength(1)
    fail = false
    await controller.retry()
    expect(calls.map((c) => c.request_id)).toEqual([
      'fixed-request',
      'fixed-request',
    ])
    expect(controller.store.getState().pending).toBeUndefined()
    expect(
      pendingChoices(controller.store.getState().snapshot as CommunityOwner)[0]
        .remaining,
    ).toBe(1)
  })
  it('does not let a pre-claim read overwrite the completed owner state', async () => {
    const read = deferred<CommunityOwner>(),
      after = owner()
    after.milestones[0].remaining = 1
    const controller = new CommunityRewardsController(
      api({
        owner: () => read.promise,
        act: async () => ({ contract_version: 1, result: {}, owner: after }),
      }),
      () => {},
      () => 'claim',
    )
    const loading = controller.load()
    await controller.act({
      type: 'claim',
      milestone_id: 'sample-step',
      reward_id: 'fixture:dye:ochre',
      offer_version: 'sample-offer-v1',
    })
    read.resolve(owner())
    await loading
    expect(
      (controller.store.getState().snapshot as CommunityOwner).milestones[0]
        .remaining,
    ).toBe(1)
  })
})

it('a definitive recruitment denial releases the pending action for correction', async () => {
  const controller = new CommunityRewardsController(
    api({
      act: async () => {
        throw new HttpError(403, 'RecruitmentPermissionRequired')
      },
    }),
    () => {},
    () => 'denied-request',
  )
  await controller.act({
    type: 'create_invitation',
    universe_id: '00000000-0000-4000-8000-000000000003',
    kind: 'combined',
    game_id: 'orbit-imperium',
    alliance: { universe_id: 'u', epoch_id: 'e', alliance_id: 'a' },
  })
  expect(controller.store.getState().busy).toBe(false)
  expect(controller.store.getState().pending).toBeUndefined()
  expect(controller.store.getState().error).toContain('not accepted')
})
