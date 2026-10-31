import { afterEach, expect, it, vi } from 'vitest'
import { gamePort } from './http'
import { readyFixture } from '../test-support/bootstrap'
import type {
  BoundProgressionOptions,
  QueryContext,
  QuoteRequest,
} from '../client-model/commands'

const { session, snapshot } = readyFixture(4)
const context: QueryContext = {
  binding: snapshot.candidate.binding,
  request_id: snapshot.request_id,
}
const upgrade: QuoteRequest = {
  type: 'Upgrade',
  body: '00000000-0000-4000-8000-000000000040',
  building: 'MetalMine',
}
const crystal: QuoteRequest = { ...upgrade, building: 'CrystalMine' }
function option(
  context: QueryContext,
  request: QuoteRequest,
): BoundProgressionOptions {
  if (request.type === 'Transport') throw Error('invalid fixture')
  return {
    protocol: 4,
    ...context,
    request,
    viewer_revision: '1',
    sampled_at: 1000,
    as_of_ms: 1000,
    terms: null,
    terms_hash: null,
    blockers: [],
    estimates: null,
  }
}
function fixture(mutate = (options: BoundProgressionOptions[]) => options) {
  const fetch = vi.fn(async (_url: string, init: RequestInit) => {
    const { context, requests, request } = JSON.parse(String(init.body))
    const options = mutate(
      (requests ?? [request]).map((r: QuoteRequest) => option(context, r)),
    )
    return new Response(JSON.stringify(requests ? { options } : options[0]), {
      status: 200,
    })
  })
  vi.stubGlobal('fetch', fetch)
  return {
    fetch,
    read: gamePort(session.csrf, snapshot.candidate).progressionOptions!,
  }
}
afterEach(() => vi.unstubAllGlobals())

it('loads a catalog once, deduplicates cost and eligibility, and preserves consumer correlation', async () => {
  const { read, fetch } = fixture()
  const otherContext = {
    ...context,
    request_id: '00000000-0000-4000-8000-000000000099',
  }
  const results = await Promise.all([
    read(context, upgrade),
    read(otherContext, upgrade),
    read(context, crystal),
  ])
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(fetch.mock.calls[0][0]).toMatch(/\/progression-options\/bulk$/)
  expect(JSON.parse(String(fetch.mock.calls[0][1].body))).toEqual({
    context,
    requests: [upgrade, crystal],
  })
  expect(results.map((r) => r.request_id)).toEqual([
    context.request_id,
    otherContext.request_id,
    context.request_id,
  ])
  expect(results.map((r) => r.request)).toEqual([upgrade, upgrade, crystal])
  // The next invalidation fetches fresh terms; no response cache masks completion.
  await Promise.all([read(context, upgrade), read(context, crystal)])
  expect(fetch).toHaveBeenCalledTimes(2)
})

it('keeps independent account/planet epochs out of the same batch', async () => {
  const { read, fetch } = fixture()
  const next = {
    ...context,
    binding: {
      ...context.binding,
      epoch: '00000000-0000-4000-8000-000000000099',
    },
  }
  const results = await Promise.all([
    read(context, upgrade),
    read(next, crystal),
  ])
  expect(fetch).toHaveBeenCalledTimes(2)
  expect(results.map((r) => r.binding.epoch)).toEqual([
    context.binding.epoch,
    next.binding.epoch,
  ])
})

it.each([
  'missing',
  'reordered',
  'request',
  'binding',
  'revision',
  'time',
  'protocol',
] as const)('rejects every row of a %s bulk response', async (failure) => {
  const { read } = fixture((options) => {
    if (failure === 'missing') return options.slice(0, 1)
    if (failure === 'reordered') return options.reverse()
    if (failure === 'request')
      options[1].request_id = '00000000-0000-4000-8000-000000000099'
    if (failure === 'binding')
      options[1].binding = {
        ...context.binding,
        player: '00000000-0000-4000-8000-000000000099',
      }
    if (failure === 'revision') options[1].viewer_revision = '2'
    if (failure === 'time') options[1].as_of_ms = 2000
    if (failure === 'protocol') options[1].protocol = 3
    return options
  })
  const results = await Promise.allSettled([
    read(context, upgrade),
    read(context, crystal),
  ])
  expect(results.map((r) => r.status)).toEqual(['rejected', 'rejected'])
})

it('fails the whole batch on network error and allows a fresh retry', async () => {
  const { read, fetch } = fixture()
  fetch.mockRejectedValueOnce(new Error('offline'))
  const results = await Promise.allSettled([
    read(context, upgrade),
    read(context, crystal),
  ])
  expect(results.map((r) => r.status)).toEqual(['rejected', 'rejected'])
  expect(await read(context, upgrade)).toMatchObject({ request: upgrade })
  expect(fetch).toHaveBeenCalledTimes(2)
})
