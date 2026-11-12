import { describe, expect, it } from 'vitest'
import { validate } from './schema'
import { communityRewardsApi } from '../adapters/community-rewards'

describe('community rewards owner boundary', () => {
  it('keeps one-dye claims narrow and rejects client supplied identities', () => {
    const request = {
      contract_version: 1,
      request_id: 'selection-1',
      action: {
        type: 'claim',
        milestone_id: 'sample-step',
        reward_id: 'account:dye:sample-blue',
        offer_version: 'v1',
      },
    }
    expect(validate('CommunityActionRequest', request)).toEqual(request)
    expect(() =>
      validate('CommunityActionRequest', {
        ...request,
        subject: 'another-player',
      }),
    ).toThrow()
    expect(() =>
      validate('CommunityActionRequest', {
        ...request,
        action: { ...request.action, reward_id: ['sample-blue', 'sample-red'] },
      }),
    ).toThrow()
  })
  it('preserves the request identity across retries and authenticates writes', async () => {
    const calls: RequestInit[] = []
    const send: typeof fetch = async (_input, init) => {
      calls.push(init!)
      return new Response('{}', { status: 503 })
    }
    const api = communityRewardsApi('session-csrf', send)
    const request = {
      contract_version: 1 as const,
      request_id: 'selection-1',
      action: { type: 'activate_time' as const, award_id: 'sample-award' },
    }
    for (let attempt = 0; attempt < 2; attempt++)
      await expect(
        api.act(request, new AbortController().signal),
      ).rejects.toThrow()
    expect(
      calls.map((call) => JSON.parse(String(call.body)).request_id),
    ).toEqual(['selection-1', 'selection-1'])
    expect(calls[0].headers).toMatchObject({ 'x-csrf-token': 'session-csrf' })
    expect(calls[0].credentials).toBe('same-origin')
  })
  it('represents standalone servers without manufacturing an empty rewards account', async () => {
    const send: typeof fetch = async () =>
      new Response(JSON.stringify({ enabled: false }))
    expect(
      await communityRewardsApi('', send).owner(new AbortController().signal),
    ).toEqual({ enabled: false })
    expect(() => validate('CommunityStatus', { enabled: true })).toThrow()
  })
})

describe('recognition rendering contract', () => {
  it('accepts explicit cosmetic references and bounded support-duration honors only', () => {
    const mark = {
      id: 'fixture-mark',
      name: 'Fixture recognition',
      scope: 'account',
      owner_kind: 'account',
      access: 'earned',
      render: { kind: 'support_duration', months: 6 },
    }
    expect(validate('CosmeticMark', mark)).toEqual(mark)
    expect(() =>
      validate('CosmeticMark', {
        ...mark,
        render: { kind: 'support_duration', months: 0 },
      }),
    ).toThrow()
    expect(() =>
      validate('CosmeticMark', {
        ...mark,
        render: { kind: 'script', source: 'arbitrary content' },
      }),
    ).toThrow()
    expect(() =>
      validate('CosmeticMark', {
        ...mark,
        render: { kind: 'effect', item_id: 'sample-effect', css: 'color:red' },
      }),
    ).toThrow()
  })
})
