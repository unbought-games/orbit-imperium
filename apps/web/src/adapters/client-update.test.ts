import { afterEach, expect, it, vi } from 'vitest'
import { request } from './http'
import { createGameUpdatesPort } from './updates'
import { clientUpdate, ClientUpdateRequired } from './client-update'
import { readyFixture } from '../test-support/bootstrap'
import { bootstrapFixture, memoryStorage } from '../test-support/bootstrap'
import { browserDependencies, prepareRuntime } from './runtime'
import { RuntimeController } from './runtime-controller'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('checks successful HTTP headers before attempting to parse an incompatible response', async () => {
  const observe = vi.spyOn(clientUpdate, 'observe').mockReturnValue(true)
  const response = new Response('not even JSON', {
    headers: { 'X-Orbit-Client-Build': 'new-build' },
  })
  const json = vi.spyOn(response, 'json')
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => response),
  )
  await expect(request('/api/test')).rejects.toBeInstanceOf(
    ClientUpdateRequired,
  )
  expect(observe).toHaveBeenCalledWith('new-build')
  expect(json).not.toHaveBeenCalled()
})

it('does not reload into a failed deployment and retains the original HTTP failure', async () => {
  const observe = vi.spyOn(clientUpdate, 'observe')
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json(
        { code: 'Unavailable' },
        { status: 503, headers: { 'X-Orbit-Client-Build': 'new-build' } },
      ),
    ),
  )
  await expect(request('/api/test')).rejects.toMatchObject({
    status: 503,
    code: 'Unavailable',
  })
  expect(observe).not.toHaveBeenCalled()
})

it('preserves successful bodyless session changes while announcing a new build', async () => {
  const observe = vi.spyOn(clientUpdate, 'observe').mockReturnValue(true)
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(null, {
          status: 204,
          headers: { 'X-Orbit-Client-Build': 'new-build' },
        }),
    ),
  )
  const deps = browserDependencies()
  Object.defineProperty(deps, 'storage', { value: memoryStorage() })
  const initial = await prepareRuntime(bootstrapFixture(), 'document', deps)
  const owner = new RuntimeController(initial, deps)
  await expect(owner.logout()).resolves.toBe(true)
  expect(owner.store.getState()).toMatchObject({
    runtime: { status: 'anonymous' },
    message: '',
    busy: false,
  })
  if (initial.status !== 'authenticated' || initial.game.status !== 'ready')
    throw Error('fixture')
  expect(initial.game.model.ready).toBe(false)
  expect(observe).toHaveBeenCalledWith('new-build')
})

it('checks streaming headers before opening delivery or consuming events', async () => {
  vi.spyOn(clientUpdate, 'observe').mockReturnValue(true)
  const cancel = vi.fn()
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(new ReadableStream({ cancel }), {
          headers: {
            'Content-Type': 'text/event-stream',
            'X-Orbit-Client-Build': 'new-build',
          },
        }),
    ),
  )
  const onConnect = vi.fn(),
    onUpdate = vi.fn(),
    onDisconnect = vi.fn()
  await expect(
    createGameUpdatesPort().subscribe(
      readyFixture(4).snapshot.candidate.binding,
      null,
      {
        signal: new AbortController().signal,
        onConnect,
        onUpdate,
        onDisconnect,
      },
    ),
  ).rejects.toBeInstanceOf(ClientUpdateRequired)
  expect(onConnect).not.toHaveBeenCalled()
  expect(onUpdate).not.toHaveBeenCalled()
  expect(onDisconnect).toHaveBeenCalledOnce()
  expect(cancel).toHaveBeenCalledOnce()
})
