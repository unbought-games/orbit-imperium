import { expect, it, vi } from 'vitest'
import type { components } from '../contracts'
import type { Coordinator } from '../client-model/coordinator'
import {
  DispatchReviewSession,
  reviewedDraft,
  revalidateReview,
} from './dispatch-review-session'

type S = components['schemas']
const at = { galaxy: 1, system: 2, position: 3 }
const terms: S['FleetTerms4'] = {
  intent: {
    origin: 'home',
    mission: 'Hold',
    hold_hours: 8,
    speed_percent: 70,
    destination: {
      type: 'Body',
      id: 'moon',
      expected_kind: 'Moon',
      expected_owner: 'ally',
    },
    ships: [{ ship_type: 'SmallCargo', count: '2', owner: 'me' }],
    cargo: { metal: '42000000', crystal: '1000000', deuterium: '3000000' },
  },
  profile_hash: 'rules',
  terms_hash: 'quote',
  distance: 1,
  speeds: [],
  duration_ms: 1,
  fuel: '1',
  capacity: '5',
  maximum_payload: '4',
  slot_limit: '1',
}
it('retires earlier reviews across origins, fresh preparations, sends and sessions', () => {
  const session = new DispatchReviewSession()
  const first = session.open('editor', terms, at)
  expect(session.match(first.id, 'other')).toBeUndefined()
  expect(new DispatchReviewSession().match(first.id, 'home')).toBeUndefined()
  const simulator = session.prepare(true)
  expect(session.match(first.id, 'home')).toBeUndefined()
  expect(session.shouldPrepare(simulator)).toBe(true)
  session.enterEditor()
  expect(session.shouldPrepare(simulator)).toBe(false)
  const second = session.open(simulator, terms, at)
  session.retire(first.id)
  expect(session.match(second.id, 'home')).toBe(second)
  session.retire(second.id)
  expect(session.match(second.id, 'home')).toBeUndefined()
  const third = session.open('manual', terms, at)
  session.enterEditor()
  expect(session.match(third.id, 'home')).toBeUndefined()
})

it.each<S['MissionDestination4']>([
  terms.intent.destination,
  { type: 'Debris', coordinates: at, field_identity: 'original' },
  { type: 'EmptyPosition', coordinates: at, slot_revision: '3' },
  { type: 'Site', selection: { id: 'site', expected_revision: '2' } },
])(
  'refuses changed $type identity before requesting a quote',
  async (destination) => {
    const mission =
      destination.type === 'Debris'
        ? 'Harvest'
        : destination.type === 'EmptyPosition'
          ? 'Colonize'
          : destination.type === 'Site'
            ? 'Attack'
            : 'Hold'
    const review = new DispatchReviewSession().open(
      'edit',
      { ...terms, intent: { ...terms.intent, mission, destination } },
      at,
    )
    const changed =
      destination.type === 'Body'
        ? { ...destination, expected_owner: 'other' }
        : destination.type === 'Debris'
          ? { ...destination, field_identity: 'replacement' }
          : destination.type === 'EmptyPosition'
            ? { ...destination, slot_revision: '4' }
            : {
                ...destination,
                selection: { ...destination.selection, expected_revision: '3' },
              }
    const world = vi.fn<Coordinator['world']>().mockResolvedValue(changed)
    await expect(
      revalidateReview(
        {
          refresh: async () => {},
          store: {
            getState: () => ({
              ready: true,
              stale: false,
              connectionInterrupted: false,
            }),
          },
          world,
        },
        review,
      ),
    ).rejects.toThrow('destination changed')
    expect(world).toHaveBeenCalledTimes(1)
  },
)

it('requotes the exact hold manifest and rejects changed terms', async () => {
  const review = new DispatchReviewSession().open('edit', terms, at)
  expect(reviewedDraft(review)).toMatchObject({
    mission: 'Hold',
    targetKind: 'moon',
    ships: { SmallCargo: '2' },
    speed: 70,
  })
  const world = vi
    .fn<Coordinator['world']>()
    .mockResolvedValueOnce(terms.intent.destination)
    .mockResolvedValueOnce({ ...terms, terms_hash: 'different' })
  await expect(
    revalidateReview(
      {
        refresh: async () => {},
        store: {
          getState: () => ({
            ready: true,
            stale: false,
            connectionInterrupted: false,
          }),
        },
        world,
      },
      review,
    ),
  ).rejects.toThrow('terms changed')
  expect(world).toHaveBeenNthCalledWith(2, {
    type: 'FleetQuote',
    intent: terms.intent,
  })
})

it('restores an auto-fill review with fresh cargo while retaining its original target and flight conditions', async () => {
  const original = {
    ...terms,
    intent: {
      ...terms.intent,
      cargo_fill: { minimum: terms.intent.cargo, groups: [['Metal' as const]] },
    },
  }
  const review = new DispatchReviewSession().open('edit', original, at)
  const latest = {
    ...original,
    terms_hash: 'fresh',
    intent: {
      ...original.intent,
      cargo: { ...original.intent.cargo, metal: '52000000' },
    },
  }
  const reader = {
    refresh: async () => {},
    store: {
      getState: () => ({
        ready: true,
        stale: false,
        connectionInterrupted: false,
      }),
    },
    world: vi.fn<Coordinator['world']>(),
  }
  reader.world
    .mockResolvedValueOnce(original.intent.destination)
    .mockResolvedValueOnce(latest)
  await expect(revalidateReview(reader, review)).resolves.toEqual(latest)
  reader.world
    .mockResolvedValueOnce(original.intent.destination)
    .mockResolvedValueOnce({ ...latest, fuel: '1000000' })
  await expect(revalidateReview(reader, review)).rejects.toThrow(
    'Fleet terms changed',
  )
})
