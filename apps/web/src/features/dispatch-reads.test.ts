import { expect, it, vi } from 'vitest'
import type { components } from '../contracts'
import type { Coordinator } from '../client-model/coordinator'
import {
  currentDispatchRead,
  startDispatchObservation,
  startDispatchTiming,
  type DispatchTimingRequest,
} from './dispatch-reads'
type S = components['schemas']
const coordinates = { galaxy: 1, system: 2, position: 3 }
const destination: S['MissionDestination4'] = {
  type: 'Body',
  id: 'moon',
  expected_kind: 'Moon',
  expected_owner: 'other',
}
const request: DispatchTimingRequest = {
  kind: 'Moon',
  coordinates,
  intent: {
    origin: 'home',
    mission: 'Transport',
    ships: [{ owner: 'me', ship_type: 'SmallCargo', count: '2' }],
    cargo: { metal: '0', crystal: '0', deuterium: '0' },
    speed_percent: 50,
  },
}
const estimate: S['FleetEstimate4'] = {
  intent: { ...request.intent, destination },
  estimate: true,
  profile_hash: 'profile',
  duration_ms: 200000,
  fuel: '1000000',
  capacity: '5000000000',
  maximum_payload: '4999000000',
}
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
function world() {
  return vi.fn<Coordinator['world']>(async (query) => {
    if (
      query.type === 'ResolveDestination' ||
      query.type === 'ResolveMissionSite'
    )
      return destination
    if (query.type === 'FleetEstimate')
      return { ...estimate, intent: query.intent }
    throw Error(`Unexpected ${query.type}`)
  })
}
it('background estimates preserve explicit moon identity, speed and selected ships without requesting a review quote', async () => {
  const read = world(),
    publish = vi.fn()
  await startDispatchTiming(read, request, true, publish).done
  expect(read.mock.calls).toEqual([
    [
      {
        type: 'ResolveDestination',
        selection: { type: 'BodyAt', kind: 'Moon', coordinates },
      },
    ],
    [{ type: 'FleetEstimate', intent: { ...request.intent, destination } }],
  ])
  expect(publish).toHaveBeenCalledWith({ terms: estimate })
})
it.each(['resolution', 'estimate', 'error'] as const)(
  'cancelled %s cannot publish over a new estimate',
  async (phase) => {
    const read = world(),
      publish = vi.fn()
    const held = deferred<Awaited<ReturnType<Coordinator['world']>>>()
    const entered = deferred<void>()
    if (phase !== 'resolution') read.mockResolvedValueOnce(destination)
    read.mockImplementationOnce(() => {
      entered.resolve()
      return held.promise
    })
    const old = startDispatchTiming(read, request, true, publish)
    await entered.promise
    old.cancel()
    await startDispatchTiming(
      read,
      { ...request, intent: { ...request.intent, speed_percent: 20 } },
      true,
      publish,
    ).done
    const calls = read.mock.calls.length
    if (phase === 'error') held.reject(Error('NotFound'))
    else held.resolve(phase === 'resolution' ? destination : estimate)
    await old.done
    expect(read).toHaveBeenCalledTimes(calls)
    expect(publish).toHaveBeenCalledTimes(1)
    expect(publish.mock.calls[0][0].terms.intent.speed_percent).toBe(20)
  },
)
it('failed estimates publish an honest unavailable result without old terms', async () => {
  const read = world(),
    publish = vi.fn()
  read
    .mockResolvedValueOnce(destination)
    .mockRejectedValueOnce(Error('NotFound'))
  await startDispatchTiming(read, request, true, publish).done
  expect(publish).toHaveBeenCalledWith({
    error: expect.stringContaining('no longer available'),
  })
})
it('a changed historical target blocks estimation before flight terms are requested', async () => {
  const read = world(),
    publish = vi.fn()
  await startDispatchTiming(
    read,
    {
      ...request,
      observation: { coordinates, target: { ...destination, id: 'previous' } },
    },
    true,
    publish,
  ).done
  expect(read).toHaveBeenCalledTimes(1)
  expect(publish).toHaveBeenCalledWith({
    error: expect.stringContaining('observed target has changed'),
  })
})
it('private-site timing resolves the site selection before estimating', async () => {
  const read = world(),
    publish = vi.fn()
  const site = { id: 'private', expected_revision: '3' }
  read.mockResolvedValueOnce({ type: 'Site', selection: site })
  await startDispatchTiming(read, { ...request, site }, true, publish).done
  expect(read).toHaveBeenNthCalledWith(1, {
    type: 'ResolveMissionSite',
    selection: site,
  })
  expect(publish.mock.calls[0][0].terms.intent.destination).toEqual({
    type: 'Site',
    selection: site,
  })
})
it('compatible revision refreshes retain evidence, while changed inputs, model, and disabled reads hide it immediately', () => {
  const model = {},
    read = { model, key: '1:2', revision: '1', observation: 'last observed' }
  expect(currentDispatchRead(model, '1:2', read)).toBe(read)
  expect(currentDispatchRead(model, '1:3', read)).toBeNull()
  expect(currentDispatchRead({}, '1:2', read)).toBeNull()
  expect(currentDispatchRead(model, null, read)).toBeNull()
  expect(currentDispatchRead(model, '1:2', null)).toBeNull()
})
it.each(['success', 'failure'] as const)(
  'a cancelled galaxy %s cannot replace the selected colony observation',
  async (outcome) => {
    const held = deferred<Awaited<ReturnType<Coordinator['world']>>>()
    const read = world(),
      publish = vi.fn()
    read.mockReturnValueOnce(held.promise)
    const old = startDispatchObservation(read, 1, 2, publish)
    old.cancel()
    const observation: S['GalaxySystem4'] = {
      galaxy: 1,
      system: 1,
      observed_at: 1000,
      positions: [],
      player_names: {},
    }
    read.mockResolvedValueOnce(observation)
    await startDispatchObservation(read, 1, 1, publish).done
    if (outcome === 'failure') held.reject(Error('Unavailable'))
    else held.resolve({ ...observation, system: 2 })
    await old.done
    expect(publish.mock.calls).toEqual([[observation]])
  },
)
it('a failed current observation clears old evidence instead of inventing an empty galaxy', async () => {
  const read = world(),
    publish = vi.fn()
  read.mockRejectedValueOnce(Error('Unavailable'))
  await startDispatchObservation(read, 1, 2, publish).done
  expect(publish.mock.calls).toEqual([[undefined]])
})
